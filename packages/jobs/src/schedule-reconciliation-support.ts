import type { OperationContext } from "./adapter.js";
import { assertJsonValue, canonicalJson } from "@relkit/contracts";
import { Effect, Result } from "effect";
import { observeJobs } from "./jobs-observability.js";
import { ScheduleReconciliationFailure } from "./schedule-reconciliation-service.js";
import type {
  NativeOwnedScheduleRecord,
  ScheduleReconciliationOptions,
} from "./schedule-reconciliation.types.js";
/** Retries an ambiguous native write once in Effect.
 * @param write - Idempotent native write callback.
 * @param context - Context containing the stable operation identity.
 * @returns Native result or ScheduleReconciliationFailure.
 * @example Effect.runPromise(writeWithRecoveryEffect(() => native.upsert(value, context), context));
 */
export const writeWithRecoveryEffect = Effect.fn("Jobs.writeScheduleWithRecovery")(
  (write: () => Promise<unknown>, context: OperationContext) =>
    observeJobs(
      "schedule.writeRecovery",
      Effect.gen(function* () {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const result = yield* Effect.result(
            Effect.tryPromise({
              try: write,
              catch: (cause) => cause,
            }),
          );
          if (Result.isFailure(result)) {
            if (!isAmbiguous(result.failure))
              return yield* new ScheduleReconciliationFailure({
                operation: "write",
                cause: result.failure,
              });
            continue;
          }
          if (isUnsupported(result.success))
            return yield* new ScheduleReconciliationFailure({
              operation: "write",
              cause: new Error(
                "RELKIT_SCHEDULE_UNSUPPORTED:" + (context.operationId ?? "operation"),
              ),
            });
          if (isUnknown(result.success)) continue;
          return result.success;
        }
        return yield* new ScheduleReconciliationFailure({
          operation: "write",
          cause: new Error("RELKIT_SCHEDULE_WRITE_UNKNOWN:" + (context.operationId ?? "operation")),
        });
      }),
    ),
);
/** Promise compatibility native write retry.
 * @param write - Idempotent native write callback.
 * @param context - Context containing the stable operation identity.
 * @returns Native result.
 * @throws Original terminal write error or unknown outcome error.
 * @example await writeWithRecovery(() => native.upsert(value, context), context);
 */
export async function writeWithRecovery(
  write: () => Promise<unknown>,
  context: OperationContext,
): Promise<unknown> {
  const result = await Effect.runPromise(Effect.result(writeWithRecoveryEffect(write, context)));
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
/** Binds one stable operation identity to a native schedule write.
 * @param context - Base provider operation context.
 * @param operationIdValue - Idempotent write identity.
 * @returns Frozen context with the operation identity.
 * @example writeContext(context, "schedule-upsert-1");
 */
export function writeContext(
  context: OperationContext,
  operationIdValue: string,
): OperationContext {
  return Object.freeze({ ...context, operationId: operationIdValue });
}
/** Recognizes a native schedule record with an identifier.
 * @param value - Provider list entry.
 * @returns True when a record carries an id.
 * @example isScheduleRecord({ id: "hourly" });
 */
export function isScheduleRecord(value: unknown): value is NativeOwnedScheduleRecord {
  return isRecord(value) && typeof value.id === "string";
}
function isUnknown(value: unknown): boolean {
  return isRecord(value) && value.outcome === "unknown";
}
function isUnsupported(value: unknown): boolean {
  return isRecord(value) && value.outcome === "unsupported";
}
function isAmbiguous(value: unknown): boolean {
  return !(value instanceof Error && /^4\d\d/u.test(value.message));
}
/** Adds ownership and canonical input metadata to a desired native schedule.
 * @param schedule - Authored schedule definition.
 * @param options - Runtime identity and job binding.
 * @param owner - Ownership identity for reconciliation.
 * @returns Frozen native definition with canonical metadata.
 * @throws TypeError for non-JSON schedule input.
 * @example nativeDefinition(schedule, options, "owner-1");
 */
export function nativeDefinition(
  schedule: ScheduleReconciliationOptions["desired"][number],
  options: Omit<ScheduleReconciliationOptions, "native">,
  owner: string,
) {
  assertJsonValue(schedule.input);
  return Object.freeze({
    ...schedule,
    metadata: Object.freeze({
      owner,
      application: options.context.application,
      environment: options.context.environment,
      service: options.context.service,
      scope: options.context.scope,
      jobId: options.jobId,
      ...(options.taskId === undefined ? {} : { taskId: options.taskId }),
      ...(options.taskVersion === undefined ? {} : { taskVersion: options.taskVersion }),
      buildId: options.buildId,
      serviceGeneration: options.context.serviceGeneration,
      canonicalInput: canonicalJson(schedule.input),
    }),
  });
}
/** Tests for a nonarray provider record.
 * @param value - Candidate provider value.
 * @returns True for a nonarray object.
 * @example isRecord({ id: "hourly" });
 */
export function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
