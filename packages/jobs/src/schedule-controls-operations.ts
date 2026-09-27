import { assertJsonValue, canonicalJson } from "@relkit/contracts";
import { Effect, Schema } from "effect";
import type {
  ScheduleDefinition,
  ScheduleListOptions,
  ScheduleWriteOptions,
  ScheduleWriteReceipt,
} from "./job.types.js";
import { assertJobsCapabilityEffect, JobsCapabilityError } from "./capabilities.js";
import type { NativeScheduleOperations } from "./adapter.js";
import { JobControlUnknownError } from "./control-errors.js";
import { unknownRecoveryEffect } from "./control-support-receipts.js";
import { controlWriteEffect } from "./control-write.js";
import type { JobsRuntime } from "./runtime.js";
import {
  boundedCursor,
  boundedId,
  idleSignal,
  isOutcome,
  isRecord,
  isUnknown,
  normalizeRead,
} from "./schedule-controls-value.js";
/** Expected native schedule operation failure with its compatibility cause.
 * @example new ScheduleOperationFailure({ cause: new Error("provider rejected") });
 */
export class ScheduleOperationFailure extends Schema.TaggedError<ScheduleOperationFailure>()(
  "Jobs.ScheduleOperationFailure",
  { cause: Schema.Defect() },
) {}
/** Lists bounded native schedules in Effect.
 * @param runtime - Jobs runtime and native adapter.
 * @param schedule - Native schedule provider.
 * @param options - Page limit, cursor, and signal.
 * @returns A read receipt or ScheduleOperationFailure.
 * @example Effect.runPromise(listSchedulesOperationEffect(runtime, schedule));
 */
export const listSchedulesOperationEffect = Effect.fn("Jobs.listSchedulesOperation")(function* (
  runtime: JobsRuntime,
  schedule: NativeScheduleOperations,
  options?: ScheduleListOptions,
) {
  yield* requireScheduleCapabilityEffect(runtime);
  const limit = options?.limit ?? 25;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    return yield* new ScheduleOperationFailure({
      cause: new RangeError("Schedule list limit must be between 1 and 100"),
    });
  const cursor = yield* Effect.try({
    try: () => (options?.cursor === undefined ? undefined : boundedCursor(options.cursor)),
    catch: (cause) => new ScheduleOperationFailure({ cause }),
  });
  const value = yield* Effect.tryPromise({
    try: () =>
      schedule.list(
        { limit, ...(cursor === undefined ? {} : { cursor }) },
        runtime.operationContext({ signal: options?.signal ?? idleSignal() }),
      ),
    catch: (cause) => new ScheduleOperationFailure({ cause }),
  });
  return yield* Effect.try({
    try: () => normalizeRead(value),
    catch: (cause) => new ScheduleOperationFailure({ cause }),
  });
});
/** Reads one bounded native schedule in Effect.
 * @param runtime - Jobs runtime and native adapter.
 * @param schedule - Native schedule provider.
 * @param id - Schedule identifier.
 * @param signal - Optional caller cancellation signal.
 * @returns A read receipt or ScheduleOperationFailure.
 * @example Effect.runPromise(getScheduleOperationEffect(runtime, schedule, "hourly"));
 */
export const getScheduleOperationEffect = Effect.fn("Jobs.getScheduleOperation")(function* (
  runtime: JobsRuntime,
  schedule: NativeScheduleOperations,
  id: string,
  signal?: AbortSignal,
) {
  yield* requireScheduleCapabilityEffect(runtime);
  const scheduleId = yield* Effect.try({
    try: () => boundedId(id),
    catch: (cause) => new ScheduleOperationFailure({ cause }),
  });
  const value = yield* Effect.tryPromise({
    try: () =>
      schedule.get(scheduleId, runtime.operationContext({ signal: signal ?? idleSignal() })),
    catch: (cause) => new ScheduleOperationFailure({ cause }),
  });
  return yield* Effect.try({
    try: () => normalizeRead(value),
    catch: (cause) => new ScheduleOperationFailure({ cause }),
  });
});
/** Validates and performs one idempotent native schedule write in Effect.
 * @param runtime - Jobs runtime and native adapter.
 * @param schedule - Native schedule provider.
 * @param value - Definition or schedule identifier.
 * @param options - Operation identity and caller signal.
 * @param operation - Native write method.
 * @returns A write receipt or ScheduleOperationFailure.
 * @example Effect.runPromise(writeScheduleOperationEffect(runtime, schedule, definition, options, "upsert"));
 */
export const writeScheduleOperationEffect = Effect.fn("Jobs.writeScheduleOperation")(function* (
  runtime: JobsRuntime,
  schedule: NativeScheduleOperations,
  value: ScheduleDefinition | string,
  options: ScheduleWriteOptions,
  operation: "upsert" | "pause" | "resume" | "delete",
) {
  yield* requireScheduleCapabilityEffect(runtime);
  const { operationId, scheduleId } = yield* Effect.try({
    try: () => {
      const operationId = boundedId(options.operationId);
      const scheduleId = typeof value === "string" ? boundedId(value) : boundedId(value.id);
      if (typeof value !== "string") assertJsonValue(value);
      return { operationId, scheduleId };
    },
    catch: (cause) => new ScheduleOperationFailure({ cause }),
  });
  const call = () =>
    operation === "upsert"
      ? schedule.upsert(
          JSON.parse(canonicalJson(value)) as never,
          runtime.operationContext({ signal: options.signal ?? idleSignal(), operationId }),
        )
      : schedule[operation](
          scheduleId,
          runtime.operationContext({ signal: options.signal ?? idleSignal(), operationId }),
        );
  const result: unknown = yield* Effect.mapError(
    controlWriteEffect(call, options.signal, operationId),
    (error) => new ScheduleOperationFailure({ cause: error.cause }),
  );
  if (isUnknown(result)) {
    const recovery = yield* Effect.mapError(
      unknownRecoveryEffect(result),
      (error) => new ScheduleOperationFailure({ cause: error.cause }),
    );
    return yield* new ScheduleOperationFailure({
      cause: new JobControlUnknownError(
        result.operationId || operationId,
        result.idempotencyKey,
        recovery,
      ),
    });
  }
  return yield* Effect.try({
    try: () => {
      if (
        !isRecord(result) ||
        result.operationId !== operationId ||
        result.scheduleId !== scheduleId ||
        !isOutcome(result.outcome)
      )
        throw new TypeError("Native schedule receipt is invalid");
      return Object.freeze(result as ScheduleWriteReceipt);
    },
    catch: (cause) => new ScheduleOperationFailure({ cause }),
  });
});
/** Requires the native schedule method and reported capability. */
const requireScheduleCapabilityEffect = Effect.fn("Jobs.requireScheduleCapability")(function* (
  runtime: JobsRuntime,
) {
  if (runtime.adapter.schedules === undefined)
    return yield* new ScheduleOperationFailure({
      cause: new JobsCapabilityError("schedules"),
    });
  yield* Effect.mapError(
    assertJobsCapabilityEffect(runtime.capabilities, "schedules"),
    (error) =>
      new ScheduleOperationFailure({
        cause: new JobsCapabilityError(error.capability, error.reason),
      }),
  );
});
