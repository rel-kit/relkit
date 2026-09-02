import type { JsonValue } from "@relkit/contracts";
import type { LocalServiceInstance, LocalServicePlanEntry } from "@relkit/local-service";
import { LOCAL_RESOURCE_LABEL, localProjectLabels, localResourceLabels } from "./identity.js";
import {
  readProviderOverrides,
  removeProviderOverrides,
  summarizeProviderOverrides,
  writeProviderOverrides,
} from "./provider-overrides.js";
import { aborted, frozenResult, startService, writeFailureState } from "./reconciler-lifecycle.js";
import {
  compatible,
  createSecrets,
  desiredServices,
  generatedSecrets,
  outputPorts,
  recipeFor,
  sameBindings,
  serviceSignature,
} from "./reconciler-support.js";
import type { LocalServiceReconciler, LocalServiceReconcilerOptions } from "./reconciler-types.js";
import { removeLocalServiceState, writeLocalServiceState } from "./service-state.js";

export * from "./reconciler-types.js";

interface TrackedService {
  readonly instance: LocalServiceInstance;
  readonly signature: string;
  readonly secrets: Readonly<Record<string, string>>;
  readonly owned: boolean;
}

export function createLocalServiceReconciler(
  options: LocalServiceReconcilerOptions,
): LocalServiceReconciler {
  const projectLabels = localProjectLabels(options.identity);
  const tracked = new Map<string, TrackedService>();
  const signatures = new Map<string, string>();
  let closed = false;
  const reconciler: LocalServiceReconciler = {
    reconcile: async (request) => {
      if (closed) throw new Error("Local service reconciler is closed.");
      const desired = desiredServices(request);
      const previous = readProviderOverrides(options.identity);
      const instances = await options.materializer.list(projectLabels, request.signal);
      const next = new Map<string, TrackedService>();
      const bindings: { bindingId: string; values: Readonly<Record<string, JsonValue>> }[] = [];
      const reused: string[] = [];
      const started: string[] = [];
      const removed: string[] = [];
      const startedIds: string[] = [];
      let active: LocalServicePlanEntry | undefined;
      try {
        for (const entry of desired) {
          active = entry;
          aborted(request.signal);
          const recipe = recipeFor(entry, request.recipes, options.materializer.integrationId);
          const signature = serviceSignature(entry);
          const labels = localResourceLabels(options.identity, {
            bindingId: entry.bindingId,
            recipe: entry.recipe,
            planHash: request.planHash,
          });
          const candidates = instances.filter(
            (instance) => instance.labels[LOCAL_RESOURCE_LABEL.bindingId] === entry.bindingId,
          );
          const retained = tracked.get(entry.bindingId);
          let secrets = generatedSecrets(recipe, previous, entry.bindingId, retained?.secrets);
          let instance = candidates.find(
            (candidate) =>
              secrets !== undefined &&
              compatible(
                candidate,
                labels["dev.relkit.recipe-id"]!,
                request.planHash,
                signatures.get(entry.bindingId),
                signature,
              ),
          );
          for (const candidate of candidates) {
            if (candidate.id === instance?.id) continue;
            await options.materializer.remove(candidate.id, request.signal);
            removed.push(entry.bindingId);
          }
          if (instance === undefined) {
            secrets ??= createSecrets(recipe);
            instance = await startService(options, entry, recipe, labels, secrets, request.signal);
            startedIds.push(instance.id);
            started.push(entry.bindingId);
          } else {
            reused.push(entry.bindingId);
          }
          const ports = outputPorts(recipe, instance);
          await recipe.initialize?.({
            ports,
            secrets: secrets!,
            ...(request.signal ? { signal: request.signal } : {}),
          });
          const values = recipe.outputs({ ports, secrets: secrets! });
          bindings.push({ bindingId: entry.bindingId, values });
          next.set(entry.bindingId, {
            instance,
            signature,
            secrets: secrets!,
            owned:
              retained?.instance.id === instance.id
                ? retained.owned
                : options.preserveOnClose !== true,
          });
        }
        const desiredIds = new Set(desired.map((entry) => entry.bindingId));
        for (const [bindingId, service] of tracked) {
          if (desiredIds.has(bindingId) || !service.owned) continue;
          await options.materializer.remove(service.instance.id, request.signal);
          removed.push(bindingId);
        }
        bindings.sort((left, right) => left.bindingId.localeCompare(right.bindingId));
        const overrides = sameBindings(previous, request.planHash, bindings)
          ? summarizeProviderOverrides(previous!)
          : writeProviderOverrides(options.identity, request.planHash, bindings);
        const state = writeLocalServiceState(
          options.identity,
          request.planHash,
          request.plan.services.map((entry) => ({
            bindingId: entry.bindingId,
            recipe: entry.recipe,
            phase: desiredIds.has(entry.bindingId) ? "healthy" : "stopped",
          })),
        );
        tracked.clear();
        signatures.clear();
        for (const [bindingId, service] of next) {
          tracked.set(bindingId, service);
          signatures.set(bindingId, service.signature);
        }
        return frozenResult(overrides, state, reused, started, removed);
      } catch (error) {
        await Promise.allSettled(startedIds.map((id) => options.materializer.remove(id)));
        writeFailureState(options, request, active);
        throw error;
      }
    },
    close: async () => {
      if (closed) return;
      closed = true;
      await Promise.allSettled(
        [...tracked.values()]
          .filter((service) => service.owned)
          .map((service) => options.materializer.remove(service.instance.id)),
      );
      if (options.preserveOnClose !== true) {
        removeProviderOverrides(options.identity);
        removeLocalServiceState(options.identity);
      }
      tracked.clear();
      signatures.clear();
    },
  };
  return Object.freeze(reconciler);
}
