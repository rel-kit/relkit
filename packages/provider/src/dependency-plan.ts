/**
 * Applies selected requirement validation to compiler-emitted integration plans.
 * Checks finish before executable imports and readiness; each call resolves fresh
 * installed identities so removing an SDK cannot hide behind prepared artifacts.
 */
import { Effect } from "effect";
import type { IntegrationDependencyPhase, RuntimeIntegrationPlan } from "@relkit/contracts";
import { SelectedDependencies } from "./dependency-preflight.service.js";
import type { DependencyPackageManager } from "./dependency-preflight.types.js";

/**
 * Validates the requirements retained by an accepted graph's integration plan.
 * @param plan - Deterministic selected registrations and portable requirements.
 * @param options - Actual consumer root, operation phase and project manager.
 * @returns Lazy fresh dependency identities or typed preflight/resolution failure.
 */
export const checkIntegrationDependencies = Effect.fn("SelectedDependencies.plan")(function* (
  plan: RuntimeIntegrationPlan,
  options: {
    readonly projectRoot: string;
    readonly phase: IntegrationDependencyPhase;
    readonly manager?: DependencyPackageManager;
  },
) {
  const checker = yield* SelectedDependencies;
  return yield* Effect.forEach(
    plan.integrations,
    (entry) =>
      checker.check({
        ...options,
        adapter: entry.packageName,
        capabilities: [entry.capability],
        requirements: entry.requirements ?? [],
      }),
    { concurrency: 1 },
  );
});
