import type {
  ScheduleDefinition,
  ScheduleListOptions,
  ScheduleReadReceipt,
  ScheduleWriteOptions,
  ScheduleWriteReceipt,
  JobScheduleClient,
} from "./job.types.js";
import { Effect, Result, Schema } from "effect";
import type { NativeScheduleOperations } from "./adapter.js";
import { JobsCapabilityError } from "./capabilities.js";
import { observeJobs } from "./jobs-observability.js";
import { requireJobsRuntime, type JobsRuntime } from "./runtime.js";
import {
  getScheduleOperationEffect,
  listSchedulesOperationEffect,
  writeScheduleOperationEffect,
} from "./schedule-controls-operations.js";
/** A native schedule operation failed or returned an invalid receipt.
 * @example if (error instanceof JobScheduleControlFailure) console.log(error.message);
 */
export class JobScheduleControlFailure extends Schema.TaggedError<JobScheduleControlFailure>()(
  "Jobs.ScheduleControlFailure",
  { cause: Schema.Defect() },
) {}
/** Creates a schedule facade in Effect.
 * @param runtime - Runtime owning native schedule operations.
 * @returns A schedule client or JobScheduleControlFailure.
 * @example Effect.runSync(createScheduleControlsEffect(runtime));
 */
export const createScheduleControlsEffect = Effect.fn("Jobs.createScheduleControls")(
  (runtime: JobsRuntime) =>
    observeJobs(
      "schedule.createControls",
      Effect.gen(function* () {
        const schedule = runtime.adapter.schedules;
        if (schedule === undefined)
          return yield* new JobScheduleControlFailure({
            cause: new JobsCapabilityError("schedules"),
          });
        return Object.freeze({
          list: (options?: ScheduleListOptions) =>
            runSchedule(listSchedulesEffect(runtime, schedule, options)),
          get: (id: string, options?: { readonly signal?: AbortSignal }) =>
            runSchedule(getScheduleEffect(runtime, schedule, id, options?.signal)),
          upsert: (definition: ScheduleDefinition, options: ScheduleWriteOptions) =>
            runSchedule(writeScheduleEffect(runtime, schedule, definition, options, "upsert")),
          pause: (id: string, options: ScheduleWriteOptions) =>
            runSchedule(writeScheduleEffect(runtime, schedule, id, options, "pause")),
          resume: (id: string, options: ScheduleWriteOptions) =>
            runSchedule(writeScheduleEffect(runtime, schedule, id, options, "resume")),
          delete: (id: string, options: ScheduleWriteOptions) =>
            runSchedule(writeScheduleEffect(runtime, schedule, id, options, "delete")),
        }) as JobScheduleClient;
      }),
    ),
);
/** Synchronous schedule facade factory.
 * @param runtime - Runtime owning native schedule operations.
 * @returns A schedule client.
 * @throws JobsCapabilityError when native schedules are unavailable.
 * @example createScheduleControls(runtime);
 */
export function createScheduleControls(runtime = requireJobsRuntime()): JobScheduleClient {
  const result = Effect.runSync(Effect.result(createScheduleControlsEffect(runtime)));
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
/** Lists native schedules in Effect.
 * @param runtime - Jobs runtime.
 * @param schedule - Native schedule provider.
 * @param options - Page and signal options.
 * @returns A read receipt or JobScheduleControlFailure.
 * @example Effect.runPromise(listSchedulesEffect(runtime, schedule));
 */
export const listSchedulesEffect = Effect.fn("Jobs.listSchedules")(
  (runtime: JobsRuntime, schedule: NativeScheduleOperations, options?: ScheduleListOptions) =>
    observeJobs(
      "schedule.list",
      Effect.mapError(
        listSchedulesOperationEffect(runtime, schedule, options),
        (error) => new JobScheduleControlFailure({ cause: error.cause }),
      ),
    ),
);
/** Reads a single native schedule in Effect.
 * @param runtime - Jobs runtime.
 * @param schedule - Native schedule provider.
 * @param id - Schedule identifier.
 * @param signal - Optional cancellation signal.
 * @returns A read receipt or JobScheduleControlFailure.
 * @example Effect.runPromise(getScheduleEffect(runtime, schedule, "hourly"));
 */
export const getScheduleEffect = Effect.fn("Jobs.getSchedule")(
  (runtime: JobsRuntime, schedule: NativeScheduleOperations, id: string, signal?: AbortSignal) =>
    observeJobs(
      "schedule.get",
      Effect.mapError(
        getScheduleOperationEffect(runtime, schedule, id, signal),
        (error) => new JobScheduleControlFailure({ cause: error.cause }),
      ),
    ),
);
/** Writes or changes a native schedule in Effect.
 * @param runtime - Jobs runtime.
 * @param schedule - Native schedule provider.
 * @param value - Definition or schedule identifier.
 * @param options - Idempotent operation options.
 * @param operation - Write operation.
 * @returns A write receipt or JobScheduleControlFailure.
 * @example Effect.runPromise(writeScheduleEffect(runtime, schedule, definition, options, "upsert"));
 */
export const writeScheduleEffect = Effect.fn("Jobs.writeSchedule")(
  (
    runtime: JobsRuntime,
    schedule: NativeScheduleOperations,
    value: ScheduleDefinition | string,
    options: ScheduleWriteOptions,
    operation: "upsert" | "pause" | "resume" | "delete",
  ) =>
    observeJobs(
      "schedule.write",
      Effect.mapError(
        writeScheduleOperationEffect(runtime, schedule, value, options, operation),
        (error) => new JobScheduleControlFailure({ cause: error.cause }),
      ),
    ),
);
/** Preserves original Promise failures for schedule client callers. */
async function runSchedule<A>(effect: Effect.Effect<A, JobScheduleControlFailure>): Promise<A> {
  const result = await Effect.runPromise(Effect.result(effect));
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
