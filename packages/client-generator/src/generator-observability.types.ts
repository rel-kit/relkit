import type { Effect } from "effect";

/** A stable generator operation label; callers must never supply user data.
 * @example const operation: GeneratorOperation = "schemaType";
 */
export type GeneratorOperation = string;

/** Replaceable telemetry for generator operations.
 * @example const service: GeneratorTelemetryService = { observe: (_operation, effect) => effect };
 */
export interface GeneratorTelemetryService {
  /** Records a generator operation.
   * @param operation - Static operation name.
   * @param effect - Work to observe.
   * @returns The original Effect success, error, and requirement channels.
   * @example service.observe("schemaType", Effect.succeed("string"));
   */
  readonly observe: <A, E, R>(
    operation: GeneratorOperation,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}
