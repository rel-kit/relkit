import type { Effect } from "effect";
import type { BucketOperation } from "./client.types.js";

/** Substitutable observation boundary for bucket operations.
 * @example const telemetry: BucketTelemetryService = { observe: (_operation, effect) => effect };
 */
export interface BucketTelemetryService {
  /** Wrap an operation with spans and metrics.
   * @param operation - Fixed operation name.
   * @param effect - Effect to observe.
   * @returns Effect with the same success and error channels.
   * @example telemetry.observe("get", Effect.succeed(undefined));
   */
  readonly observe: <A, E, R>(
    operation:
      | BucketOperation
      | "define"
      | "isDescriptor"
      | "assertDescriptor"
      | "createClient"
      | "asProvider",
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}
