import type { ScheduleRegistration } from "@relkit/graph";
import {
  completeSpan,
  currentTracePropagation,
  runInExecutionContext,
  startRootSpan,
  type SpanRuntime,
} from "@relkit/invocation";
import type { ScheduleDefinition } from "@relkit/jobs/legacy";
import type { JobScheduler, MaterializedJob } from "./materialize-jobs-types.js";
import { JobMaterializationError } from "./materialize-jobs-types.js";

/** Bind a schedule to enqueue with detached producer tracing and persisted propagation.
 * @returns Nothing; the scheduler retains the registered enqueue callback.
 * @param scheduler - Generation-owned schedule registrar.
 * @param registration - Validated provider or schedule registration.
 * @param jobs - Materialized queues indexed by job identifier.
 * @param runtime - Optional tracing runtime for detached producer spans.
 */
export function bindSchedule(
  scheduler: JobScheduler,
  registration: ScheduleRegistration,
  jobs: ReadonlyMap<string, MaterializedJob>,
  runtime?: SpanRuntime,
): void {
  const job = jobs.get(registration.jobId);
  if (job === undefined)
    throw new JobMaterializationError(`Schedule "${registration.id}" targets an unknown job`);
  scheduler.register(scheduleDefinition(registration), (input, context) => {
    if (runtime === undefined) return job.enqueue(input, { acceptedAt: context.fireAt.getTime() });
    const span = startRootSpan(runtime, `relkit.schedule.${context.scheduleId}`, "producer");
    span.attribute("relkit.schedule.id", context.scheduleId);
    span.attribute("relkit.job.id", job.id);
    return runInExecutionContext({ span, runtime }, async () => {
      let failure: unknown;
      try {
        return await job.enqueue(
          input,
          { acceptedAt: context.fireAt.getTime() },
          {
            operation: "enqueue",
            signal: new AbortController().signal,
            profile: job.policy.profile,
            propagation: currentTracePropagation()!,
          },
        );
      } catch (error) {
        failure = error;
        throw error;
      } finally {
        completeSpan(span, failure);
      }
    });
  });
}

/** Validate a queue schedule and retain its overlap/timezone settings.
 * @returns A validated native schedule definition.
 * @param registration - Validated provider or schedule registration.
 */
function scheduleDefinition(registration: ScheduleRegistration): ScheduleDefinition {
  if (!isRecord(registration.schedule))
    throw new JobMaterializationError(`Schedule "${registration.id}" is not an object`);
  const scheduleId =
    typeof registration.schedule.id === "string"
      ? `${registration.jobId}.${registration.schedule.id}`
      : registration.id.replaceAll(":", ".");
  return { ...registration.schedule, id: scheduleId } as unknown as ScheduleDefinition;
}

/** Recognize non-null object records before reading native fields.
 * @returns Whether the native value satisfies this guard.
 * @param value - Native value being validated or projected.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
