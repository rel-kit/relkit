import type { NativeScheduleOperations } from "./adapter.js";
import { Context, Layer, Schema } from "effect";
/** Injectable native provider for schedule reconciliation.
 * @example const service = yield* NativeScheduleService;
 */
export class NativeScheduleService extends Context.Service<
  NativeScheduleService,
  NativeScheduleOperations
>()("relkit/jobs/NativeScheduleService") {}
/** Provides a native schedule implementation to the Effect reconciler.
 * @param native - Native schedule operations.
 * @returns A Layer containing the provider.
 * @example nativeScheduleLayer(adapter.nativeSchedules);
 */
export const nativeScheduleLayer = (native: NativeScheduleOperations) =>
  Layer.succeed(NativeScheduleService, native);
/** Expected native schedule reconciliation failure with original cause.
 * @example if (error instanceof ScheduleReconciliationFailure) console.log(error.message);
 */
export class ScheduleReconciliationFailure extends Schema.TaggedError<ScheduleReconciliationFailure>()(
  "Jobs.ScheduleReconciliationFailure",
  { operation: Schema.String, cause: Schema.Defect() },
) {}
