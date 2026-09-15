import type {
  LocalServiceInstance,
  LocalServicePlanEntry,
  LocalServiceRecipeInput,
  LocalServiceState,
  LocalServiceWorkerArtifact,
} from "@relkit/local-service";
import { normalizeLocalServiceRecipe } from "@relkit/local-service";
import { localResourceName } from "./identity.js";
import type { ProviderOverrideSummary } from "./provider-overrides.js";
import { environmentFile, environmentFiles } from "./reconciler-environment.js";
import { workerStartOptions } from "./reconciler-worker.js";
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
  recipe: LocalServiceRecipeInput,
  labels: Readonly<Record<string, string>>,
  secrets: Readonly<Record<string, string>>,
  signal?: AbortSignal,
  environmentVariables?: Readonly<Record<string, string>>,
  workerArtifact?: LocalServiceWorkerArtifact,
  environmentVariablesByUnit?: Readonly<Record<string, Readonly<Record<string, string>>>>,
): Promise<LocalServiceInstance> {
  const normalized = normalizeLocalServiceRecipe(recipe);
  const worker = workerStartOptions(normalized, workerArtifact);
  const request = {
    name: localResourceName(options.identity, entry.bindingId),
    ...(normalized.recipeVersion === 1
      ? {
          ...(normalized.volumes.data === undefined
            ? {}
            : { volumeName: localResourceName(options.identity, entry.bindingId, "data") }),
        }
      : {
          volumeNames: Object.fromEntries(
            Object.keys(normalized.volumes).map((name) => [
              name,
              localResourceName(options.identity, entry.bindingId, name),
            ]),
          ),
          networkName: localResourceName(options.identity, entry.bindingId, "network"),
        }),
    labels,
    recipe,
    ...(labels["dev.relkit.service-generation"] === undefined
      ? {}
      : { serviceGeneration: labels["dev.relkit.service-generation"] }),
    ...(signal === undefined ? {} : { signal }),
    ...(environmentVariables === undefined ? {} : { environmentVariables }),
    ...(workerArtifact === undefined ? {} : { workerArtifact }),
    ...(worker.bindMounts === undefined ? {} : { bindMounts: worker.bindMounts }),
    ...(worker.environmentVariablesByUnit === undefined
      ? {}
      : { environmentVariablesByUnit: worker.environmentVariablesByUnit }),
    ...(environmentVariablesByUnit === undefined
      ? {}
      : {
          environmentVariablesByUnit: {
            ...worker.environmentVariablesByUnit,
            ...environmentVariablesByUnit,
          },
        }),
  };
  const environment = normalized.recipeVersion === 1 ? environmentFile(recipe, secrets) : undefined;
  const unitEnvironments = environmentFiles(recipe, secrets);
  const normalizedRequest = normalized.recipeVersion === 2
    ? { ...request, ...(Object.keys(unitEnvironments).length === 0 ? {} : { environmentFiles: unitEnvironments }) }
    : request;
  return withEnvironmentFiles(options, normalizedRequest, environment);
}

async function withEnvironmentFiles(
  options: LocalServiceReconcilerOptions,
  request: Parameters<LocalServiceReconcilerOptions["materializer"]["start"]>[0],
  environment: string | undefined,
): Promise<LocalServiceInstance> {
  if (environment !== undefined) {
    return withLocalStateTemporaryFile(options.identity, environment, (path) =>
      options.materializer.start({ ...request, environmentFile: path }),
    );
  }
  const entries = Object.entries(request.environmentFiles ?? {});
  return withUnitEnvironmentFiles(options, request, entries, 0, {});
}

async function withUnitEnvironmentFiles(
  options: LocalServiceReconcilerOptions,
  request: Parameters<LocalServiceReconcilerOptions["materializer"]["start"]>[0],
  entries: readonly (readonly [string, string])[],
  index: number,
  paths: Readonly<Record<string, string>>,
): Promise<LocalServiceInstance> {
  const entry = entries[index];
  if (entry === undefined) return options.materializer.start({ ...request, environmentFiles: paths });
  return withLocalStateTemporaryFile(options.identity, entry[1], (path) =>
    withUnitEnvironmentFiles(options, request, entries, index + 1, { ...paths, [entry[0]]: path }),
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
