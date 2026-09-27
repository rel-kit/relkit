import type { Effect } from "effect";

/** Fixed operation labels used by event authoring and publishing metrics.
 * @example const operation: EventOperation = "client.publish"
 */
export type EventOperation =
  | "event.define"
  | "event.isDescriptor"
  | "event.assertDescriptor"
  | "function.define"
  | "function.isDescriptor"
  | "function.bindEvents"
  | "function.delivery"
  | "function.profile"
  | "function.retry"
  | "function.rejectFields"
  | "client.create"
  | "client.publish"
  | "client.parsePayload"
  | "client.normalizeOptions"
  | "client.normalizeAttributes"
  | "client.normalizeResult"
  | "client.resolveProvider"
  | "client.notify"
  | "client.resolveValue"
  | "client.assertOptionalText"
  | "client.assertVersion"
  | "client.runAbortable";

/** Substitutable observer for event operations.
 * Implementations retain the original success and error channels.
 * @example const telemetry: EventTelemetryService = { observe: (_name, effect) => effect }
 */
export interface EventTelemetryService {
  /** Observes one event operation.
   * @param operation - Fixed bounded operation label.
   * @param effect - Operation to observe.
   * @returns The same success and error channels.
   * @example telemetry.observe("event.define", Effect.void)
   */
  readonly observe: <A, E, R>(
    operation: EventOperation,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}
