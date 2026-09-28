import { Schema } from "effect";
/** Invalid authored channel data or an invalid channel operation.
 * @example new ChannelValidationError({ operation: "channel.define", reason: "Missing events" });
 */
export class ChannelValidationError extends Schema.TaggedError<ChannelValidationError>()(
  "Realtime.ChannelValidationError",
  { operation: Schema.String, reason: Schema.String, cause: Schema.optionalKey(Schema.Defect()) },
) {}
/** A realtime dispatcher was required but none was bound.
 * @example new RealtimeDispatcherError({ operation: "dispatch.current", reason: "No realtime dispatcher is active." });
 */
export class RealtimeDispatcherError extends Schema.TaggedError<RealtimeDispatcherError>()(
  "Realtime.DispatcherError",
  { operation: Schema.String, reason: Schema.String },
) {}
/** An action thrown while entering a dispatcher scope.
 * @example new RealtimeActionError({ operation: "dispatch.runWith", cause: new Error("failed") });
 */
export class RealtimeActionError extends Schema.TaggedError<RealtimeActionError>()(
  "Realtime.ActionError",
  { operation: Schema.String, cause: Schema.Defect() },
) {}
/** A provider operation failed at the external adapter boundary.
 * @example new RealtimeProviderError({ operation: "provider.trigger", cause: new Error("offline") });
 */
export class RealtimeProviderError extends Schema.TaggedError<RealtimeProviderError>()(
  "Realtime.ProviderError",
  { operation: Schema.String, cause: Schema.Defect() },
) {}
/** An operation ID is malformed or outside its receipt window.
 * @example new OperationIdFailure({ code: "OPERATION_ID_INVALID", reason: "Invalid ID" });
 */
export class OperationIdFailure extends Schema.TaggedError<OperationIdFailure>()(
  "Realtime.OperationIdFailure",
  {
    code: Schema.Literals(["OPERATION_ID_INVALID", "IDEMPOTENCY_WINDOW_EXPIRED"]),
    reason: Schema.String,
  },
) {}
