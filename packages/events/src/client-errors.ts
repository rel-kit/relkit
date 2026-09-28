import type { StandardIssue } from "@relkit/schema";
import { Schema } from "effect";

/** Payload rejected by its Standard Schema validator.
 * @example new EventPayloadValidationError([{ message: "Required" }])
 */
export class EventPayloadValidationError extends TypeError {
  readonly code = "RELKIT_EVENT_PAYLOAD_VALIDATION" as const;
  constructor(readonly issues: readonly StandardIssue[]) {
    super("Event payload validation failed");
    this.name = "EventPayloadValidationError";
  }
}

/** Tagged payload failure used by Effect clients before Promise adaptation.
 * @example new EventPayloadValidationFailure([{ message: "Required" }])
 */
export class EventPayloadValidationFailure extends Schema.TaggedError<EventPayloadValidationFailure>()(
  "EventPayloadValidationFailure",
  { issues: Schema.Array(Schema.Unknown), message: Schema.String },
) {
  declare readonly issues: readonly StandardIssue[];
  constructor(issues: readonly StandardIssue[]) {
    super({ issues, message: "Event payload validation failed" });
  }
}

/** Publication attempted without a declared event dependency.
 * @example new EventDependencyError("orders.created")
 */
export class EventDependencyError extends Schema.TaggedError<EventDependencyError>()(
  "EventDependencyError",
  { eventId: Schema.String, message: Schema.String },
) {
  readonly code = "RELKIT_EVENT_DEPENDENCY_UNDECLARED" as const;
  constructor(eventId: string) {
    super({ eventId, message: `Event dependency "${eventId}" is not declared on this function` });
  }
}

/** Requested provider profile is missing.
 * @example new EventProfileError("default")
 */
export class EventProfileError extends Schema.TaggedError<EventProfileError>()(
  "EventProfileError",
  { profile: Schema.String, message: Schema.String },
) {
  readonly code = "RELKIT_EVENT_PROFILE_UNKNOWN" as const;
  constructor(profile: string) {
    super({ profile, message: `Event profile "${profile}" is not configured` });
  }
}

/** Selected provider cannot publish events.
 * @example new EventProviderError()
 */
export class EventProviderError extends Schema.TaggedError<EventProviderError>()(
  "EventProviderError",
  { message: Schema.String },
) {
  readonly code = "RELKIT_EVENT_PROVIDER_UNAVAILABLE" as const;
  constructor() {
    super({ message: "Event provider does not implement publish" });
  }
}

/** Publication cancelled through its AbortSignal.
 * @example new EventOperationCancelledError()
 */
export class EventOperationCancelledError extends Schema.TaggedError<EventOperationCancelledError>()(
  "EventOperationCancelledError",
  { message: Schema.String },
) {
  readonly code = "ABORT_ERR" as const;
  constructor() {
    super({ message: "Event operation cancelled" });
    this.name = "AbortError";
  }
}

/** Publication exceeded its absolute deadline.
 * @example new EventOperationTimeoutError()
 */
export class EventOperationTimeoutError extends Schema.TaggedError<EventOperationTimeoutError>()(
  "EventOperationTimeoutError",
  { message: Schema.String },
) {
  readonly code = "ETIMEDOUT" as const;
  constructor() {
    super({ message: "Event operation timed out" });
    this.name = "TimeoutError";
  }
}

/** Other expected client validation failure.
 * @example new EventClientValidationError({ message: "Invalid event options" })
 */
export class EventClientValidationError extends Schema.TaggedError<EventClientValidationError>()(
  "EventClientValidationError",
  { message: Schema.String, cause: Schema.optionalKey(Schema.Defect()) },
) {}
