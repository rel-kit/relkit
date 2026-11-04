/**
 * Promise entry points for the generated `runtime-integrations.ts` module. The Effect
 * composition stays here, so generated applications need no direct `effect` dependency.
 */
import { Effect } from "effect";
import type { IntegrationDependencyPhase, RuntimeIntegrationPlan } from "../contracts/index.js";
import { initializeIntegration } from "./dependency-initialization.js";
import { checkIntegrationDependencies } from "./dependency-plan.js";
import { SelectedDependenciesLive } from "./dependency-preflight.service.js";

/**
 * Checks that every selected integration's dependencies are installed, before any of them loads.
 * @param plan - The selected integrations and their requirements from the compiled graph.
 * @param options - The project root and the phase that runs the check.
 * @returns Resolves when every requirement is met.
 * @throws SelectedDependencyFailure or DependencyResolutionFailure when a requirement is not met.
 * @example await checkRuntimeIntegrations(plan, { projectRoot, phase: "runtime" });
 */
export function checkRuntimeIntegrations(
  plan: RuntimeIntegrationPlan,
  options: { readonly projectRoot: string; readonly phase: IntegrationDependencyPhase },
): Promise<void> {
  return Effect.runPromise(
    checkIntegrationDependencies(plan, options).pipe(
      Effect.provide(SelectedDependenciesLive),
      Effect.asVoid,
    ),
  );
}

/**
 * Loads one checked integration module and names its package when loading fails.
 * @param packageName - The integration package that owns the module.
 * @param load - A literal dynamic import of the module.
 * @returns The loaded module.
 * @throws SelectedDependencyInitializationFailure when the module fails to load.
 * @example const module = await loadRuntimeIntegration("@relkit/redis", () => import("@relkit/redis/runtime"));
 */
export function loadRuntimeIntegration<Module>(
  packageName: string,
  load: () => Promise<Module>,
): Promise<Module> {
  return Effect.runPromise(initializeIntegration(packageName, load));
}
