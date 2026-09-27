import { Effect, Result } from "effect";
import { stableIdentityTupleEffect } from "./identity.js";
import { observeJobs } from "./jobs-observability.js";
import { scheduleOwnerEffect } from "./schedule-reconciliation-identity.js";
import {
  isScheduleRecord,
  isRecord,
  nativeDefinition,
  writeContext,
  writeWithRecoveryEffect,
} from "./schedule-reconciliation-support.js";
import {
  NativeScheduleService,
  nativeScheduleLayer,
  ScheduleReconciliationFailure,
} from "./schedule-reconciliation-service.js";
import type {
  NativeOwnedScheduleRecord,
  ScheduleReconciliationOptions,
  ScheduleReconciliationResult,
} from "./schedule-reconciliation.types.js";
export type {
  NativeOwnedScheduleRecord,
  ScheduleReconciliationOptions,
  ScheduleReconciliationResult,
} from "./schedule-reconciliation.types.js";
export {
  NativeScheduleService,
  nativeScheduleLayer,
  ScheduleReconciliationFailure,
} from "./schedule-reconciliation-service.js";
export {
  scheduleOwner,
  scheduleOwnerEffect,
  scheduleOperationId,
  scheduleOperationIdEffect,
} from "./schedule-reconciliation-identity.js";
/** Reconciles owned schedules with ordered native writes in Effect.
 * @param options - Desired schedules and owner identity, excluding the injected provider.
 * @returns Ordered changes or ScheduleReconciliationFailure.
 * @example Effect.runPromise(Effect.provide(reconcileNativeSchedulesEffect(options), nativeScheduleLayer(native)));
 */
export const reconcileNativeSchedulesEffect = Effect.fn("Jobs.reconcileNativeSchedules")(
  (options: Omit<ScheduleReconciliationOptions, "native">) =>
    observeJobs(
      "schedule.reconcile",
      Effect.gen(function* () {
        const native = yield* NativeScheduleService;
        const failure = (operation: string, cause: unknown) =>
          new ScheduleReconciliationFailure({ operation, cause });
        if (options.workerReady !== undefined)
          yield* Effect.tryPromise({
            try: () => options.workerReady!(),
            catch: (cause) => failure("workerReady", cause),
          });
        const existing =
          options.existing ??
          (yield* Effect.tryPromise({
            try: async () => {
              const value = await native.list(
                { scope: options.context.scope, jobId: options.jobId },
                options.context,
              );
              if (!isRecord(value) || !Array.isArray(value.schedules)) return [];
              return value.schedules.filter(isScheduleRecord);
            },
            catch: (cause) => failure("list", cause),
          }));
        const owner = yield* Effect.mapError(scheduleOwnerEffect(options), (cause) =>
          failure("owner", cause),
        );
        const byId = new Map(existing.map((record) => [record.id, record]));
        const upserted: string[] = [];
        const deleted: string[] = [];
        const preserved: string[] = [];
        const desiredIds = new Set(options.desired.map((schedule) => schedule.id));
        const operationId = (id: string) =>
          stableIdentityTupleEffect(["relkit.schedule.operation", owner, id, options.buildId]);
        for (const schedule of options.desired) {
          const current = byId.get(schedule.id);
          if (current !== undefined && current.metadata?.owner !== owner)
            return yield* failure(
              "ownership",
              new Error(`RELKIT_SCHEDULE_OWNERSHIP_CONFLICT:${schedule.id}`),
            );
          const definition = yield* Effect.try({
            try: () => nativeDefinition(schedule, options, owner),
            catch: (cause) => failure("definition", cause),
          });
          const id = yield* Effect.mapError(operationId(schedule.id), (cause) =>
            failure("operationId", cause),
          );
          yield* Effect.mapError(
            writeWithRecoveryEffect(
              () =>
                native.upsert(
                  definition as unknown as import("@relkit/contracts").JsonValue,
                  writeContext(options.context, id),
                ),
              options.context,
            ),
            (cause) => failure("upsert", cause.cause),
          );
          if (current?.state === "paused") {
            const pauseId = yield* Effect.mapError(operationId(schedule.id + ":pause"), (cause) =>
              failure("operationId", cause),
            );
            yield* Effect.mapError(
              writeWithRecoveryEffect(
                () => native.pause(schedule.id, writeContext(options.context, pauseId)),
                options.context,
              ),
              (cause) => failure("pause", cause.cause),
            );
          }
          upserted.push(schedule.id);
        }
        for (const record of existing) {
          if (record.metadata?.owner !== owner) {
            preserved.push(record.id);
            continue;
          }
          if (desiredIds.has(record.id)) continue;
          const id = yield* Effect.mapError(operationId(record.id), (cause) =>
            failure("operationId", cause),
          );
          yield* Effect.mapError(
            writeWithRecoveryEffect(
              () => native.delete(record.id, writeContext(options.context, id)),
              options.context,
            ),
            (cause) => failure("delete", cause.cause),
          );
          deleted.push(record.id);
        }
        return Object.freeze({ upserted, deleted, preserved });
      }),
    ),
);
/** Promise compatibility reconciler.
 * @param options - Reconciliation inputs and native provider.
 * @returns Ordered native changes.
 * @throws The original native, validation, or ownership error.
 * @example await reconcileNativeSchedules(options);
 */
export async function reconcileNativeSchedules(
  options: ScheduleReconciliationOptions,
): Promise<ScheduleReconciliationResult> {
  const result = await Effect.runPromise(
    Effect.result(
      Effect.provide(reconcileNativeSchedulesEffect(options), nativeScheduleLayer(options.native)),
    ),
  );
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
