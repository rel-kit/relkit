import type {
  LocalServiceInstance,
  LocalServicePlanEntry,
  LocalServiceRecipeInput,
} from "@relkit/local-service";
import type {
  LocalServiceReconcileRequest,
  LocalServiceReconcilerOptions,
} from "./reconciler-types.js";
import { removeInstance } from "./reconciler-resource.js";
import { serviceInstanceIds } from "./reconciler-support.js";
import { startService } from "./reconciler-lifecycle.js";

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
