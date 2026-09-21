import type { JsonValue } from "@relkit/contracts";
import {
  normalizeLocalServiceRecipe,
  type LocalServiceInstance,
  type LocalServicePlanEntry,
} from "@relkit/local-service";
import { LOCAL_RESOURCE_LABEL, localEndpointHash, localResourceLabels } from "./identity.js";
import { readProviderOverrides } from "./provider-overrides.js";
import { aborted, writeFailureState } from "./reconciler-lifecycle.js";
import {
  compatible,
  createSecrets,
  desiredServices,
  generatedSecrets,
  groupServiceInstances,
  outputPorts,
  recipeFor,
  serviceSignature,
} from "./reconciler-support.js";
import type {
  LocalServiceReconcileRequest,
  LocalServiceReconcilerOptions,
} from "./reconciler-types.js";
import {
  readLocalServiceSecrets,
  upsertLocalServiceSecrets,
  type LocalServiceSecretState,
} from "./local-secrets.js";
import { assertHotSwapSafe } from "./reconciler-generation.js";
import { ensureServiceInstance } from "./reconciler-operation-service.js";
import { finalizeReconcile } from "./reconciler-operation-finalize.js";
import type { TrackedService } from "./reconciler-operation.js";

export async function runReconcileOperation(
  options: LocalServiceReconcilerOptions,
  projectLabels: Readonly<Record<string, string>>,
  tracked: Map<string, TrackedService>,
  signatures: Map<string, string>,
  isClosed: () => boolean,
  request: LocalServiceReconcileRequest,
) {
  if (isClosed()) throw new Error("Local service reconciler is closed.");
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
      const expectedUnitIds =
        normalizedRecipe.recipeVersion === 2
          ? normalizedRecipe.units
              .filter(
                (unit) =>
                  unit.kind !== "init" &&
                  (unit.kind !== "worker" ||
                    request.workerArtifacts?.[entry.bindingId] !== undefined),
              )
              .map((unit) => unit.id)
          : undefined;
      const signature = serviceSignature(entry);
      const endpointHash = localEndpointHash(request.endpoints?.[entry.bindingId]);
      const serviceGeneration =
        request.serviceGenerations?.[entry.bindingId] ?? request.serviceGeneration;
      const labels = localResourceLabels(options.identity, {
        bindingId: entry.bindingId,
        ...(request.environment === undefined ? {} : { environment: request.environment }),
        ...(serviceGeneration === undefined ? {} : { serviceGeneration }),
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
      assertHotSwapSafe(entry.bindingId, candidates, request.environment, serviceGeneration);
      const retained = tracked.get(entry.bindingId);
      const persisted = secretState?.bindings.find(
        (binding) =>
          binding.bindingId === entry.bindingId &&
          binding.recipe.integrationId === entry.recipe.integrationId &&
          binding.recipe.recipeId === entry.recipe.recipeId &&
          binding.recipe.recipeVersion === entry.recipe.recipeVersion,
      )?.values;
      const restored = generatedSecrets(
        recipe,
        previous,
        entry.bindingId,
        retained?.secrets,
        persisted,
      );
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
      const instance = candidates.find(
        (candidate) =>
          restored !== undefined &&
          compatible(
            candidate,
            labels["dev.relkit.recipe-id"]!,
            request.planHash,
            signatures.get(entry.bindingId),
            signature,
            request.environment,
            serviceGeneration,
            expectedUnitIds,
            endpointHash,
          ),
      );
      const keepCandidates =
        normalizedRecipe.recipeVersion === 2 &&
        candidates.some(
          (candidate) => candidate.labels[LOCAL_RESOURCE_LABEL.planHash] === request.planHash,
        ) &&
        (request.workerArtifacts?.[entry.bindingId] !== undefined ||
          !candidates.some((candidate) =>
            candidate.units?.some((unit) => unit.labels["dev.relkit.unit-kind"] === "worker"),
          ));
      const service = await ensureServiceInstance(
        options,
        request,
        entry,
        recipe,
        labels,
        secrets,
        candidates,
        instance,
        instance === undefined ? keepCandidates : true,
        startedIds,
        started,
        reused,
        removed,
      );
      const ports = outputPorts(recipe, service);
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
        instance: service,
        signature,
        secrets,
        owned:
          retained?.instance.id === service.id ? retained.owned : options.preserveOnClose !== true,
      });
    }
    return finalizeReconcile(
      options,
      request,
      desired,
      previous,
      next,
      tracked,
      signatures,
      bindings,
      reused,
      started,
      removed,
    );
  } catch (error) {
    for (const id of [...startedIds].reverse())
      await options.materializer.remove(id).catch(() => undefined);
    writeFailureState(options, request, active);
    throw error;
  }
}
