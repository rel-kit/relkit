import { Effect } from "effect";
import { stableIdentityTupleEffect } from "./identity.js";
import { observeJobs } from "./jobs-observability.js";
import type { ScheduleReconciliationOptions } from "./schedule-reconciliation.types.js";
/** Builds a stable owner identity in Effect.
 * @param options - Schedule context and job identity.
 * @returns Stable owner tuple or identity failure.
 * @example Effect.runSync(scheduleOwnerEffect({ context, jobId: "send" }));
 */
export const scheduleOwnerEffect = Effect.fn("Jobs.scheduleOwner")(
  (options: Pick<ScheduleReconciliationOptions, "context" | "jobId">) =>
    observeJobs(
      "schedule.owner",
      stableIdentityTupleEffect([
        "relkit.schedule.owner",
        options.context.application,
        options.context.environment,
        options.context.service,
        options.jobId,
      ]),
    ),
);
/** Synchronous stable schedule owner identity.
 * @param options - Schedule context and job identity.
 * @returns Stable owner tuple.
 * @example scheduleOwner({ context, jobId: "send" });
 */
export function scheduleOwner(
  options: Pick<ScheduleReconciliationOptions, "context" | "jobId">,
): string {
  return Effect.runSync(scheduleOwnerEffect(options));
}
/** Builds an idempotent native operation identity in Effect.
 * @param options - Schedule context, job, and build identity.
 * @param scheduleId - Stable native schedule identity.
 * @returns Stable operation tuple or identity failure.
 * @example Effect.runSync(scheduleOperationIdEffect(options, "hourly"));
 */
export const scheduleOperationIdEffect = Effect.fn("Jobs.scheduleOperationId")(
  (
    options: Pick<ScheduleReconciliationOptions, "context" | "jobId" | "buildId">,
    scheduleId: string,
  ) =>
    observeJobs(
      "schedule.operationId",
      Effect.gen(function* () {
        const owner = yield* scheduleOwnerEffect(options);
        return yield* stableIdentityTupleEffect([
          "relkit.schedule.operation",
          owner,
          scheduleId,
          options.buildId,
        ]);
      }),
    ),
);
/** Synchronous idempotent native operation identity.
 * @param options - Schedule context, job, and build identity.
 * @param scheduleId - Stable native schedule identity.
 * @returns Stable operation tuple.
 * @example scheduleOperationId(options, "hourly");
 */
export function scheduleOperationId(
  options: Pick<ScheduleReconciliationOptions, "context" | "jobId" | "buildId">,
  scheduleId: string,
): string {
  return Effect.runSync(scheduleOperationIdEffect(options, scheduleId));
}
