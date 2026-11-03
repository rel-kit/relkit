import { Effect, Result } from "effect";
import type { JobsAdapterRuntime } from "./adapter.js";
import { JobsCapabilityError, JobsCapabilityFailure } from "./capabilities.js";
import { observeJobs } from "./jobs-observability.js";
/** Checks the methods promised by a jobs adapter.
 * @param adapter - Candidate adapter with a validated capability report.
 * @returns Void or JobsCapabilityFailure.
 * @example Effect.runSync(assertAdapterMethodsEffect(adapter));
 */
export const assertAdapterMethodsEffect = Effect.fn("Jobs.assertAdapterMethods")(
  function* (adapter: JobsAdapterRuntime) {
    const required: readonly (keyof JobsAdapterRuntime)[] = [
      "submit",
      "get",
      "list",
      "observe",
      "cancel",
      "close",
    ];
    for (const method of required) {
      if (typeof adapter[method] !== "function")
        return yield* new JobsCapabilityFailure({
          capability: String(method),
          reason: `Jobs adapter method "${String(method)}" is required`,
        });
    }
    if (adapter.capabilities.features.schedules === true && adapter.schedules === undefined)
      return yield* new JobsCapabilityFailure({
        capability: "schedules",
        reason: "Jobs adapter advertises schedules without schedule methods",
      });
    if (adapter.capabilities.features.streams === true && adapter.streams === undefined)
      return yield* new JobsCapabilityFailure({
        capability: "streams",
        reason: "Jobs adapter advertises streams without stream methods",
      });
    if (adapter.capabilities.features.retry === true && typeof adapter.retry !== "function")
      return yield* new JobsCapabilityFailure({
        capability: "retry",
        reason: "Jobs adapter advertises retry without a retry method",
      });
  },
  (effect) => observeJobs("adapter.assertMethods", effect),
);
/** Synchronous adapter method check.
 * @param adapter - Candidate adapter.
 * @returns Void when methods are present.
 * @throws JobsCapabilityError when a method is missing.
 * @example assertAdapterMethods(adapter);
 */
export function assertAdapterMethods(adapter: JobsAdapterRuntime): void {
  const result = Effect.runSync(Effect.result(assertAdapterMethodsEffect(adapter)));
  if (Result.isFailure(result))
    throw new JobsCapabilityError(result.failure.capability, result.failure.reason);
}
