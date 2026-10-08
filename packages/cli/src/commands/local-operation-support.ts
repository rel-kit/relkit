import { resolve } from "node:path";
import { Effect, Layer, Schema } from "effect";
import { isStableId, type RuntimeIntegrationPlan } from "@relkit/contracts";
import type { LocalServiceRecipeInput } from "@relkit/local-service";
import { cliTry } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliProject, projectLiveLayer } from "../services/project.service.js";
import { compilerLayer } from "../services/compiler.service.js";
import { moduleLayer } from "../services/modules.service.js";
import { checkedLocalArtifacts } from "./dev-local.js";
import { loadLocalRecipeEffect } from "./local-runtime-modules.js";

/** Expected local usage/cohort failure with its existing public positional constructor. */
export class LocalCommandError extends Schema.TaggedError<LocalCommandError>()(
  "LocalCommandError",
  {
    code: Schema.String,
    message: Schema.String,
  },
) {
  /**
   * Creates an expected public command failure.
   * @param code - Stable local error code.
   * @param message - Existing public explanation.
   */
  constructor(code: string, message: string) {
    super({ code, message });
    this.name = "LocalCommandError";
  }
}

/**
 * Checks a local project and accepts only matching graph/runtime/service cohorts.
 * @param projectRoot - Authored project root.
 * @returns The validated application identity and complete local artifacts.
 */
export const loadLocalProjectEffect = Effect.fn("Local.loadProject")(
  function* (projectRoot: string) {
    const root = resolve(projectRoot);
    const project = yield* CliProject;
    const checked = yield* project.check({ projectRoot: root, mode: "development" });
    if (!checked.ok)
      return yield* Effect.fail(
        new LocalCommandError(
          "RELKIT_LOCAL_CHECK_FAILED",
          checked.diagnostics.map((entry) => entry.message).join("\n") || "Project check failed.",
        ),
      );
    const artifacts = yield* cliTry("local.checkedArtifacts", () =>
      checkedLocalArtifacts(root, checked),
    );
    const applicationId = artifacts.graph.appId;
    if (!isStableId(applicationId))
      return yield* Effect.fail(
        new LocalCommandError("RELKIT_LOCAL_INVALID", "Local application identity is invalid."),
      );
    return { root, checked, applicationId, ...artifacts };
  },
  (effect, _projectRoot: string) => observeCli("local.loadProject", effect),
);

/**
 * Loads each declared recipe once per operation with bounded concurrency.
 * @param projectRoot - Authored package resolution root.
 * @param plan - Accepted runtime integration cohort.
 * @param integrationIds - Required recipe identities.
 * @returns Original validated recipes keyed by owner.
 */
export const loadLocalRecipesEffect = Effect.fn("Local.loadRecipes")(
  function* (projectRoot: string, plan: RuntimeIntegrationPlan, integrationIds: readonly string[]) {
    const entries = yield* Effect.forEach(
      [...new Set(integrationIds)],
      (id) =>
        loadLocalRecipeEffect(projectRoot, plan, id).pipe(
          Effect.map((recipe) => [id, recipe] as const),
        ),
      { concurrency: 4 },
    );
    return Object.freeze(Object.fromEntries(entries));
  },
  (effect, _projectRoot: string, _plan: RuntimeIntegrationPlan, _ids: readonly string[]) =>
    observeCli("local.loadRecipes", effect),
);

/**
 * Retains the public project-check Promise adapter.
 * @param projectRoot - Authored root.
 * @param signal - Caller cancellation.
 * @returns Accepted local project data after compilation cleanup.
 */
export function loadLocalProject(projectRoot: string, signal: AbortSignal) {
  return runCliEffect(loadLocalProjectEffect(projectRoot), projectLiveLayer, signal);
}

/**
 * Retains the public recipe Promise adapter.
 * @param projectRoot - Package resolution root.
 * @param plan - Accepted runtime cohort.
 * @param integrationIds - Required recipe owners.
 * @returns Validated recipe registrations.
 */
export function loadLocalRecipes(
  projectRoot: string,
  plan: RuntimeIntegrationPlan,
  integrationIds: readonly string[],
): Promise<Readonly<Record<string, LocalServiceRecipeInput>>> {
  return runCliEffect(
    loadLocalRecipesEffect(projectRoot, plan, integrationIds),
    Layer.merge(compilerLayer, moduleLayer),
  );
}

/** Selects the unique integration responsible for required local bindings.
 * @param values - Required local binding materializers.
 * @returns The unique owner, or Docker when no bindings require another owner.
 */
export function oneMaterializer(values: readonly string[]): string {
  const unique = [...new Set(values)];
  if (unique.length > 1)
    throw new LocalCommandError(
      "RELKIT_LOCAL_INVALID",
      "Local bindings require multiple materializers.",
    );
  return unique[0] ?? "docker";
}

/** Adapts foreign cancellation into the retained legacy notification Promise.
 * @param signal - Existing foreign cancellation.
 * @returns The retained legacy notification Promise; native workflows own their listeners in Scope.
 */
export function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolveWait) =>
    signal.addEventListener("abort", () => resolveWait(), { once: true }),
  );
}

/** Checks whether the native process named by a local lease is still alive.
 * @param pid - Native lease owner PID.
 * @returns Whether it still exists, treating permission-denied probes as alive.
 */
export function processAlive(pid: number | undefined): boolean {
  if (pid === undefined || !Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

/** Renders accepted local binding phases in deterministic display order.
 * @param services - Accepted binding phases.
 * @returns The existing deterministic status lines, including the empty-plan wording.
 */
export function formatServices(
  services: readonly { readonly bindingId: string; readonly phase: string }[],
): string {
  return services.length === 0
    ? "No local services."
    : services.map((service) => `${service.bindingId}: ${service.phase}`).join("\n");
}
