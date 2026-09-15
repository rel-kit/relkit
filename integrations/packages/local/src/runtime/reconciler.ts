import type { JsonValue } from "@relkit/contracts";
import {
  normalizeLocalServiceRecipe,
  type LocalServiceInstance,
  type LocalServicePlanEntry,
} from "@relkit/local-service";
import { LOCAL_RESOURCE_LABEL, localEndpointHash, localProjectLabels, localResourceLabels } from "./identity.js";
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
  groupServiceInstances,
  serviceInstanceIds,
  serviceSignature,
} from "./reconciler-support.js";
import type {
  LocalServiceReconcileRequest,
  LocalServiceReconciler,
  LocalServiceReconcilerOptions,
} from "./reconciler-types.js";
import {
  readLocalServiceSecrets,
  upsertLocalServiceSecrets,
  type LocalServiceSecretState,
} from "./local-secrets.js";
import { removeLocalServiceState, writeLocalServiceState } from "./service-state.js";
import { assertHotSwapSafe } from "./reconciler-generation.js";
import { createReconcileQueue } from "./reconciler-queue.js";
import { removeInstance } from "./reconciler-resource.js";

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
  const reconcileNow = async (request: LocalServiceReconcileRequest) => {
      if (closed) throw new Error("Local service reconciler is closed.");
      const desired = desiredServices(request);
      const previous = readProviderOverrides(options.identity);
      let secretState: LocalServiceSecretState | undefined = readLocalServiceSecrets(options.identity);
      const instances = groupServiceInstances(
        await options.materializer.list(projectLabels, request.signal),
      );
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
          const normalizedRecipe = normalizeLocalServiceRecipe(recipe);
          const expectedUnitIds = normalizedRecipe.recipeVersion === 2
            ? normalizedRecipe.units
                .filter((unit) => unit.kind !== "init" && (unit.kind !== "worker" || request.workerArtifacts?.[entry.bindingId] !== undefined))
                .map((unit) => unit.id)
            : undefined;
          const signature = serviceSignature(entry);
          const endpointHash = localEndpointHash(request.endpoints?.[entry.bindingId]);
          const labels = localResourceLabels(options.identity, {
            bindingId: entry.bindingId,
            ...(request.environment === undefined ? {} : { environment: request.environment }),
            ...(request.serviceGeneration === undefined ? {} : { serviceGeneration: request.serviceGeneration }),
            recipe: entry.recipe,
            planHash: request.planHash,
            ...(endpointHash === undefined ? {} : { endpointHash }),
          });
          const candidates = instances.filter(
            (instance) =>
              instance.labels[LOCAL_RESOURCE_LABEL.bindingId] === entry.bindingId &&
              (request.environment === undefined ||
                instance.labels[LOCAL_RESOURCE_LABEL.environment] === request.environment),
          );
          assertHotSwapSafe(
            entry.bindingId,
            candidates,
            request.environment,
            request.serviceGeneration,
          );
          const retained = tracked.get(entry.bindingId);
          const persisted = secretState?.bindings.find(
            (binding) => binding.bindingId === entry.bindingId &&
              binding.recipe.integrationId === entry.recipe.integrationId &&
              binding.recipe.recipeId === entry.recipe.recipeId &&
              binding.recipe.recipeVersion === entry.recipe.recipeVersion,
          )?.values;
          const restored = generatedSecrets(recipe, previous, entry.bindingId, retained?.secrets, persisted);
          const secrets = restored ?? createSecrets(recipe);
          if (Object.keys(normalizedRecipe.generatedSecrets).length > 0) {
            secretState = upsertLocalServiceSecrets(
              options.identity,
              secretState,
              entry.bindingId,
              entry.recipe,
              secrets,
            );
          }
          let instance = candidates.find(
            (candidate) =>
              restored !== undefined &&
              compatible(
                candidate,
                labels["dev.relkit.recipe-id"]!,
                request.planHash,
                signatures.get(entry.bindingId),
                signature,
                request.environment,
                request.serviceGeneration,
                expectedUnitIds,
                endpointHash,
              ),
          );
          const keepCandidates =
            normalizedRecipe.recipeVersion === 2 &&
            candidates.some(
              (candidate) =>
                candidate.labels[LOCAL_RESOURCE_LABEL.planHash] === request.planHash,
            ) &&
            (request.workerArtifacts?.[entry.bindingId] !== undefined ||
              !candidates.some((candidate) =>
                candidate.units?.some(
                  (unit) => unit.labels["dev.relkit.unit-kind"] === "worker",
                ),
              ));
          let removedBeforeStart = false;
          if (instance === undefined && !keepCandidates) {
            for (const candidate of candidates) {
              await removeInstance(options, candidate, request.signal);
              removed.push(entry.bindingId);
            }
            removedBeforeStart = candidates.length > 0;
          }
          if (instance === undefined) {
            const existingIds = new Set(candidates.flatMap(serviceInstanceIds));
            instance = await startService(
              options,
              entry,
              recipe,
              labels,
              secrets,
              request.signal,
              request.environmentOverrides?.[entry.bindingId],
              request.workerArtifacts?.[entry.bindingId],
              request.environmentOverridesByUnit?.[entry.bindingId],
            );
            startedIds.push(
              ...serviceInstanceIds(instance).filter((id) => !existingIds.has(id)),
            );
            started.push(entry.bindingId);
          } else {
            reused.push(entry.bindingId);
          }
          if (!removedBeforeStart) {
            const activeIds = new Set(serviceInstanceIds(instance));
            for (const candidate of candidates) {
              if (serviceInstanceIds(candidate).some((id) => activeIds.has(id))) continue;
              await removeInstance(options, candidate, request.signal);
              removed.push(entry.bindingId);
            }
          }
          const ports = outputPorts(recipe, instance);
          await recipe.initialize?.({
            ports,
            secrets,
            ...(request.endpoints?.[entry.bindingId] === undefined
              ? {}
              : { endpoints: request.endpoints[entry.bindingId] }),
            ...(request.signal ? { signal: request.signal } : {}),
          });
          const values = recipe.outputs({
            ports,
            secrets,
            ...(request.endpoints?.[entry.bindingId] === undefined
              ? {}
              : { endpoints: request.endpoints[entry.bindingId] }),
          });
          bindings.push({ bindingId: entry.bindingId, values });
          next.set(entry.bindingId, {
            instance,
            signature,
            secrets,
            owned:
              retained?.instance.id === instance.id
                ? retained.owned
                : options.preserveOnClose !== true,
          });
        }
        const desiredIds = new Set(desired.map((entry) => entry.bindingId));
        for (const [bindingId, service] of tracked) {
          if (desiredIds.has(bindingId) || !service.owned) continue;
          await removeInstance(options, service.instance, request.signal);
          removed.push(bindingId);
        }
        bindings.sort((left, right) => left.bindingId.localeCompare(right.bindingId));
        const overrides = sameBindings(previous, request.planHash, bindings)
          ? summarizeProviderOverrides(previous!)
          : writeProviderOverrides(options.identity, request.planHash, bindings);
        const state = writeLocalServiceState(
          options.identity,
          request.planHash,
          request.plan.services.map((entry) => {
            const service = next.get(entry.bindingId)?.instance;
            return {
              bindingId: entry.bindingId,
              recipe: entry.recipe,
              phase: desiredIds.has(entry.bindingId) ? "healthy" : "stopped",
              ...(request.environment === undefined ? {} : { environment: request.environment }),
              ...(request.serviceGeneration === undefined ? {} : { serviceGeneration: request.serviceGeneration }),
              ...(service?.units === undefined
                ? {}
                : { units: service.units.map((unit) => unit.unitId ?? unit.id) }),
            };
          }),
        );
        tracked.clear();
        signatures.clear();
        for (const [bindingId, service] of next) {
          tracked.set(bindingId, service);
          signatures.set(bindingId, service.signature);
        }
        return frozenResult(overrides, state, reused, started, removed);
      } catch (error) {
        for (const id of [...startedIds].reverse()) {
          await options.materializer.remove(id).catch(() => undefined);
        }
        writeFailureState(options, request, active);
        throw error;
      }
    };
  const queue = createReconcileQueue(reconcileNow);
  const reconciler: LocalServiceReconciler = {
    reconcile: queue.enqueue,
    close: async () => {
      if (closed) return;
      closed = true;
      await queue.wait();
      await Promise.allSettled(
        [...tracked.values()]
          .filter((service) => service.owned)
          .map((service) => removeInstance(options, service.instance)),
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
