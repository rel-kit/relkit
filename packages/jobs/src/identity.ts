import { assertJsonValueEffect, serializeJsonEffect } from "@relkit/contracts";
import { Effect, Result, Schema } from "effect";
import { observeJobs } from "./jobs-observability.js";
import type { IdentityValue } from "./identity.types.js";

/** An identity tuple containing a value that cannot be encoded as JSON.
 * @example new JobIdentityError({ operation: "stableTuple", cause: new Error("invalid") });
 */
export class JobIdentityError extends Schema.TaggedError<JobIdentityError>()("Jobs.IdentityError", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/** Encodes typed tuple members in Effect so numeric and string values differ.
 * @param values - Identity components in stable order.
 * @returns Canonical JSON or JobIdentityError.
 * @example Effect.runPromise(stableIdentityTupleEffect([1, "1"]));
 */
export const stableIdentityTupleEffect = Effect.fn("Jobs.stableIdentityTuple")(
  function* (values: readonly unknown[]) {
    const typed = yield* Effect.forEach(values, identityValueEffect);
    return yield* serializeJsonEffect(typed).pipe(
      Effect.mapError((cause) => new JobIdentityError({ operation: "stableTuple", cause })),
    );
  },
  (effect) => observeJobs("identity.stableTuple", effect),
);

/** Synchronous compatibility adapter for identity tuples.
 * @param values - Identity components in stable order.
 * @returns Canonical JSON.
 * @throws The original JSON validation error for unsupported values.
 * @example stableIdentityTuple([1, "1"]);
 */
export function stableIdentityTuple(values: readonly unknown[]): string {
  return runIdentitySync(stableIdentityTupleEffect(values));
}

/** Builds a task-operation identity in Effect.
 * @param acceptanceIdentity - Stable acceptance key.
 * @param operation - Operation name.
 * @returns Canonical identity or JobIdentityError.
 * @example Effect.runPromise(taskOperationIdentityEffect("a", "send"));
 */
export const taskOperationIdentityEffect = Effect.fn("Jobs.taskOperationIdentity")(
  function* (acceptanceIdentity: string, operation: string) {
    return yield* stableIdentityTupleEffect([
      "relkit.task.operation",
      acceptanceIdentity,
      operation,
    ]);
  },
  (effect) => observeJobs("identity.taskOperation", effect),
);

/** Synchronous task-operation identity adapter.
 * @param acceptanceIdentity - Stable acceptance key.
 * @param operation - Operation name.
 * @returns Canonical identity.
 * @throws A JSON validation error for unsupported values.
 * @example taskOperationIdentity("a", "send");
 */
export function taskOperationIdentity(acceptanceIdentity: string, operation: string): string {
  return runIdentitySync(taskOperationIdentityEffect(acceptanceIdentity, operation));
}

/** Builds a retry-operation identity in Effect.
 * @param runId - Original run identifier.
 * @param operationId - Stable retry operation identifier.
 * @returns Canonical identity or JobIdentityError.
 * @example Effect.runPromise(retryOperationIdentityEffect("r", "op"));
 */
export const retryOperationIdentityEffect = Effect.fn("Jobs.retryOperationIdentity")(
  function* (runId: string, operationId: string) {
    return yield* stableIdentityTupleEffect(["relkit.task.retry", runId, operationId, "retry"]);
  },
  (effect) => observeJobs("identity.retryOperation", effect),
);

/** Synchronous retry-operation identity adapter.
 * @param runId - Original run identifier.
 * @param operationId - Stable retry operation identifier.
 * @returns Canonical identity.
 * @throws A JSON validation error for unsupported values.
 * @example retryOperationIdentity("r", "op");
 */
export function retryOperationIdentity(runId: string, operationId: string): string {
  return runIdentitySync(retryOperationIdentityEffect(runId, operationId));
}

/** Builds a schedule-occurrence identity in Effect.
 * @param scheduleId - Schedule identifier.
 * @param scheduledFor - Canonical scheduled instant.
 * @returns Canonical identity or JobIdentityError.
 * @example Effect.runPromise(scheduleOccurrenceIdentityEffect("s", "2026-01-01T00:00:00Z"));
 */
export const scheduleOccurrenceIdentityEffect = Effect.fn("Jobs.scheduleOccurrenceIdentity")(
  function* (scheduleId: string, scheduledFor: string) {
    return yield* stableIdentityTupleEffect(["relkit.job.schedule", scheduleId, scheduledFor]);
  },
  (effect) => observeJobs("identity.scheduleOccurrence", effect),
);

/** Synchronous schedule-occurrence identity adapter.
 * @param scheduleId - Schedule identifier.
 * @param scheduledFor - Canonical scheduled instant.
 * @returns Canonical identity.
 * @throws A JSON validation error for unsupported values.
 * @example scheduleOccurrenceIdentity("s", "2026-01-01T00:00:00Z");
 */
export function scheduleOccurrenceIdentity(scheduleId: string, scheduledFor: string): string {
  return runIdentitySync(scheduleOccurrenceIdentityEffect(scheduleId, scheduledFor));
}

/** Preserves the original JSON error for synchronous callers. */
function runIdentitySync<A>(effect: Effect.Effect<A, JobIdentityError>): A {
  const result = Effect.runSync(Effect.result(effect));
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}

/** Converts one value to a JSON-safe tagged representation. */
const identityValueEffect = Effect.fn("Jobs.identityValue")(function* (
  value: unknown,
): Generator<Effect.Effect<unknown, JobIdentityError>, IdentityValue, unknown> {
  if (value === undefined) return { type: "undefined" };
  if (value === null) return { type: "null", value: null };
  if (typeof value === "number")
    return { type: Object.is(value, -0) ? "negative-zero" : "number", value };
  if (typeof value === "string" || typeof value === "boolean") return { type: typeof value, value };
  if (Array.isArray(value))
    return { type: "array", value: yield* Effect.forEach(value, identityValueEffect) };
  if (typeof value === "object") {
    yield* assertJsonValueEffect(value).pipe(
      Effect.mapError((cause) => new JobIdentityError({ operation: "identityValue", cause })),
    );
    return { type: "object", value: value as IdentityValue };
  }
  return { type: typeof value };
});
