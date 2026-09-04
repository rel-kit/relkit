import type { ScheduleRegistration } from "@relkit/graph";
import type { ScheduleDefinition } from "@relkit/jobs";
import {
  completeSpan,
  currentTracePropagation,
  runInExecutionContext,
  startRootSpan,
  type SpanRuntime,
} from "@relkit/invocation";
import type { JobScheduler, MaterializedJob } from "./materialize-jobs-types.js";
import { JobMaterializationError } from "./materialize-jobs-types.js";

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

function scheduleDefinition(registration: ScheduleRegistration): ScheduleDefinition {
  if (!isRecord(registration.schedule))
    throw new JobMaterializationError(`Schedule "${registration.id}" is not an object`);
  const scheduleId =
    typeof registration.schedule.id === "string"
      ? `${registration.jobId}.${registration.schedule.id}`
      : registration.id.replaceAll(":", ".");
  return { ...registration.schedule, id: scheduleId } as unknown as ScheduleDefinition;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
