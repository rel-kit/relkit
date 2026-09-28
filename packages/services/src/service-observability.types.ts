import type { Effect } from "effect";

/** Fixed service operation labels keep telemetry dimensions bounded.
 * @example const operation: ServiceOperation = "descriptor.is";
 */
export type ServiceOperation =
  | "define"
  | "members.copy"
  | "members.unique"
  | "member.normalize"
  | "member.is-reserved"
  | "member.assert"
  | "ref.is"
  | "ref.assert"
  | "descriptor.is"
  | "descriptor.assert"
  | "descriptor.freeze"
  | "descriptor.entries"
  | "function.is"
  | "context.freeze";

/** Injectable observation boundary for service operations.
 * @example const telemetry: ServiceTelemetryService = { observe: (_, effect) => effect };
 */
export interface ServiceTelemetryService {
  /** Observe one operation while preserving its channels.
   * @param operation - Fixed operation label.
   * @param effect - Operation to measure.
   * @returns The observed Effect with unchanged success and error channels.
   * @example telemetry.observe("ref.is", Effect.succeed(true));
   */
  readonly observe: <A, E, R>(
    operation: ServiceOperation,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}
