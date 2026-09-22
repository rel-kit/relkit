import type {
  LocalServiceInstance,
  LocalServicePlanEntry,
  LocalServiceRecipeInput,
  NormalizedLocalServiceRecipe,
} from "@relkit/local-service";
import { normalizeLocalServiceRecipe } from "@relkit/local-service";
import type {
  LocalServiceReconcileRequest,
  LocalServiceReconcilerOptions,
} from "./reconciler-types.js";
import { removeInstance } from "./reconciler-resource.js";
import { serviceInstanceIds } from "./reconciler-support.js";
import { startService } from "./reconciler-lifecycle.js";
import { LOCAL_RESOURCE_LABEL } from "./identity.js";

export function keepServiceCandidates(
  recipe: NormalizedLocalServiceRecipe,
  candidates: readonly LocalServiceInstance[],
  request: LocalServiceReconcileRequest,
  bindingId: string,
): boolean {
  return (
    recipe.recipeVersion === 2 &&
    candidates.some(
      (candidate) => candidate.labels[LOCAL_RESOURCE_LABEL.planHash] === request.planHash,
    ) &&
    request.environmentOverridesByUnit?.[bindingId] === undefined &&
    (request.workerArtifacts?.[bindingId] !== undefined ||
      !candidates.some((candidate) =>
        candidate.units?.some((unit) => unit.labels["dev.relkit.unit-kind"] === "worker"),
      ))
  );
}

export async function ensureServiceInstance(
  options: LocalServiceReconcilerOptions,
  request: LocalServiceReconcileRequest,
  entry: LocalServicePlanEntry,
  recipe: LocalServiceRecipeInput,
  labels: Readonly<Record<string, string>>,
  secrets: Readonly<Record<string, string>>,
  candidates: readonly LocalServiceInstance[],
  existing: LocalServiceInstance | undefined,
  keepCandidates: boolean,
  startedIds: string[],
  started: string[],
  reused: string[],
  removed: string[],
): Promise<LocalServiceInstance> {
  let instance = existing;
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
    const portBindings = preservedPortBindings(candidates, recipe);
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
      portBindings,
    );
    startedIds.push(...serviceInstanceIds(instance).filter((id) => !existingIds.has(id)));
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
  return instance;
}

function preservedPortBindings(
  candidates: readonly LocalServiceInstance[],
  recipe: LocalServiceRecipeInput,
): Readonly<Record<string, Readonly<Record<string, number>>>> | undefined {
  const normalized = normalizeLocalServiceRecipe(recipe);
  const units = candidates.flatMap((candidate) => candidate.units ?? [candidate]);
  const bindings = Object.fromEntries(
    normalized.units.flatMap((recipeUnit) => {
      const instance = units.find((candidate) => (candidate.unitId ?? "service") === recipeUnit.id);
      if (instance === undefined) return [];
      const namedPorts = Object.fromEntries(
        Object.entries(recipeUnit.ports).flatMap(([name, containerPort]) => {
          const hostPort = instance.ports[name] ?? instance.ports[`${containerPort}/tcp`];
          return typeof hostPort === "number" ? [[name, hostPort] as const] : [];
        }),
      );
      return Object.keys(namedPorts).length === 0
        ? []
        : [[recipeUnit.id, Object.freeze(namedPorts)] as const];
    }),
  );
  return Object.keys(bindings).length === 0 ? undefined : Object.freeze(bindings);
}
