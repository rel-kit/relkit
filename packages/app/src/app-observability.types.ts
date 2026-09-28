import type { Effect } from "effect";

/** Fixed operation labels used for application authoring telemetry.
 * @example const operation: AppOperation = "define";
 */
export type AppOperation =
  | "define"
  | "env.isDefinition"
  | "id.derive"
  | "compatibility.normalize"
  | "alias.assertExclusive"
  | "constants.define"
  | "prompt.define"
  | "context.create"
  | "context.resolve";

/** A replaceable observer for application authoring operations.
 * @example const observer: AppTelemetryService = { observe: (_name, effect) => effect };
 */
export interface AppTelemetryService {
  /** Surrounds one operation without changing its result.
   * @param operation - A fixed operation label.
   * @param effect - The operation to observe.
   * @returns The observed Effect with its success and error channels intact.
   * @example observer.observe("define", Effect.succeed(app));
   */
  readonly observe: <A, E, R>(
    operation: AppOperation,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}
