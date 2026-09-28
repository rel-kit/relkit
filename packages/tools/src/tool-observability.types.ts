import type { Effect } from "effect";

/** Fixed names for tool operations; values must never contain user input.
 * @example const operation: ToolOperation = "invoke";
 */
export type ToolOperation =
  | "define"
  | "is-descriptor"
  | "assert-descriptor"
  | "is-ref"
  | "copy-target"
  | "validate-side-effect"
  | "validate-approval"
  | "is-side-effect"
  | "is-approval"
  | "required-text"
  | "positive-integer"
  | "is-positive-integer"
  | "is-function-target"
  | "is-non-empty-string"
  | "is-record"
  | "has-own"
  | "resolve-target"
  | "engine-layer"
  | "invoke"
  | "create-runtime";

/** Replaceable observer used to verify spans and metrics in tests. */
export interface ToolTelemetryService {
  /** Observe an operation without changing its channels.
   * @param operation - Stable, bounded operation name.
   * @param effect - Work to observe.
   * @returns The same success and failure channels.
   * @example telemetry.observe("is-ref", Effect.succeed(true));
   */
  readonly observe: <A, E, R>(
    operation: ToolOperation,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}
