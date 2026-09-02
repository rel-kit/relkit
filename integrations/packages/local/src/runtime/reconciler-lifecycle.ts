import type {
  LocalServiceInstance,
  LocalServicePlanEntry,
  LocalServiceRecipe,
  LocalServiceState,
} from "@relkit/local-service";
import { localResourceName } from "./identity.js";
import type { ProviderOverrideSummary } from "./provider-overrides.js";
import { environmentFile } from "./reconciler-support.js";
import type {
  LocalServiceReconcileRequest,
  LocalServiceReconcileResult,
  LocalServiceReconcilerOptions,
} from "./reconciler-types.js";
import { writeLocalServiceState } from "./service-state.js";
import { withLocalStateTemporaryFile } from "./state-paths.js";

export async function startService(
  options: LocalServiceReconcilerOptions,
  entry: LocalServicePlanEntry,
  recipe: LocalServiceRecipe,
  labels: Readonly<Record<string, string>>,
  secrets: Readonly<Record<string, string>>,
  signal?: AbortSignal,
): Promise<LocalServiceInstance> {
  const request = {
    name: localResourceName(options.identity, entry.bindingId),
    ...(recipe.volume === undefined
      ? {}
      : { volumeName: localResourceName(options.identity, entry.bindingId, "data") }),
    labels,
    recipe,
    ...(signal === undefined ? {} : { signal }),
  };
  const environment = environmentFile(recipe, secrets);
  return environment === undefined
    ? options.materializer.start(request)
    : withLocalStateTemporaryFile(options.identity, environment, (environmentFile) =>
        options.materializer.start({ ...request, environmentFile }),
      );
}

export function writeFailureState(
  options: LocalServiceReconcilerOptions,
  request: LocalServiceReconcileRequest,
  active: LocalServicePlanEntry | undefined,
): void {
  try {
    writeLocalServiceState(
      options.identity,
      request.planHash,
      request.plan.services.map((entry) => ({
        bindingId: entry.bindingId,
        recipe: entry.recipe,
        phase: entry.bindingId === active?.bindingId ? "unhealthy" : "pending",
        ...(entry.bindingId === active?.bindingId
          ? { message: "Local service reconciliation failed." }
          : {}),
      })),
    );
  } catch {
    // Preserve the original safe reconciliation failure.
  }
}

export function aborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new Error("Local reconciliation was cancelled.");
}

export function frozenResult(
  overrides: ProviderOverrideSummary,
  state: LocalServiceState,
  reused: readonly string[],
  started: readonly string[],
  removed: readonly string[],
): LocalServiceReconcileResult {
  return Object.freeze({
    overrides,
    state,
    reused: unique(reused),
    started: unique(started),
    removed: unique(removed),
  });
}

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort());
}
