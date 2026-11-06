import type { Effect } from "effect";

/** Fixed operation names keep metric dimensions bounded.
 * @example const operation: LocalServiceOperation = "recipe.normalize";
 */
export type LocalServiceOperation =
  | "recipe.normalize"
  | "plan.assert-version"
  | "state.assert-version"
  | "override.assert-version"
  | "override.binding-values";

/** Injectable tracing and metric behavior for public operations.
 * @example const telemetry: LocalServiceTelemetryService = { observe: (_operation, effect) => effect };
 */
export interface LocalServiceTelemetryService {
  /** Observe an operation without changing its result.
   * @param operation - Fixed operation name.
   * @param effect - Operation to measure.
   * @returns The original Effect success and failure channels.
   * @example telemetry.observe("recipe.normalize", Effect.succeed(recipe));
   */
  readonly observe: <A, E, R>(
    operation: LocalServiceOperation,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}
