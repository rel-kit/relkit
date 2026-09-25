import { Effect } from "effect";
import { makeFailureEffect } from "./failure-runtime.js";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type { DependencyNotConfiguredCause, ProviderFailure } from "./failure-dependency.types.js";

/** Constructs a provider failure for a missing managed client.
 * @param cause - Category and dependency name.
 * @returns A frozen provider failure with no expected error.
 * @example Effect.runSync(dependencyNotConfiguredFailureEffect({ category: "cache", dependencyName: "main" }));
 */
export function dependencyNotConfiguredFailureEffect(
  cause: DependencyNotConfiguredCause,
): Effect.Effect<ProviderFailure> {
  return observeInvocation(
    "failure.dependency",
    Effect.map(
      makeFailureEffect(
        {
          _tag: "ProviderFailure",
          kind: "provider",
          outcome: "provider-failure",
          code: "RELKIT_DEPENDENCY_NOT_CONFIGURED",
          message: `Managed dependency "${cause.category}.${cause.dependencyName}" is not configured`,
          capability: cause.category,
          profile: cause.dependencyName,
        },
        cause,
      ),
      (failure) => failure as ProviderFailure,
    ),
  );
}

/** Synchronous missing dependency failure adapter.
 * @param cause - Category and dependency name.
 * @returns A frozen provider failure.
 * @example dependencyNotConfiguredFailure({ category: "cache", dependencyName: "main" });
 */
export function dependencyNotConfiguredFailure(
  cause: DependencyNotConfiguredCause,
): ProviderFailure {
  return runInvocationSync(dependencyNotConfiguredFailureEffect(cause));
}
