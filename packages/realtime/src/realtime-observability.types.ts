import type { Effect } from "effect";
/** Bounded names used for realtime spans and metrics.
 * @example const operation: RealtimeOperation = "channel.define";
 */
export type RealtimeOperation =
  | "channel.define"
  | "channel.isDescriptor"
  | "channel.trigger"
  | "channel.getPresence"
  | "channel.copyClient"
  | "channel.copyPresence"
  | "channel.copyEvents"
  | "channel.copyReplay"
  | "channel.assertSchema"
  | "channel.isSchema"
  | "channel.validateValue"
  | "channel.isRecord"
  | "dispatch.setActive"
  | "dispatch.runWith"
  | "dispatch.current"
  | "operationId.parse"
  | "operationId.timestamp"
  | "operationId.create"
  | "provider.createDispatcher"
  | "provider.resolve"
  | "provider.trigger"
  | "provider.getPresence"
  | "provider.scope"
  | "provider.digest"
  | "provider.bytes"
  | "provider.limits";
/** Substitutable observer for realtime operation tests and application telemetry.
 * @example const observer: RealtimeTelemetryService = { observe: (_name, effect) => effect };
 */
export interface RealtimeTelemetryService {
  /** Surrounds an operation without changing its result.
   * @param operation - A stable, bounded operation name.
   * @param effect - The operation to observe.
   * @returns The same success and error channels with telemetry attached.
   * @example observer.observe("channel.define", Effect.succeed(undefined));
   */
  readonly observe: <A, E, R>(
    operation: RealtimeOperation,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}
