import type { Effect } from "effect";

/** Fixed operation name used as a bounded telemetry label.
 * @example const operation: FunctionOperation = "tool.invoke";
 */
export type FunctionOperation =
  | "error.define"
  | "error.create"
  | "error.is-descriptor"
  | "error.validate-http"
  | "error.assert-schema"
  | "error.is-record"
  | "function.define"
  | "function.invoke"
  | "function.invoke-target"
  | "function.as-tool"
  | "function.as-graph-node"
  | "function.create-descriptor"
  | "function.graph-node"
  | "function.graph-node-invoke"
  | "function.is-graph-node"
  | "function.fail"
  | "function.copy-dependencies"
  | "function.copy-publishes"
  | "function.validate-limit"
  | "function.assert-hook"
  | "function.assert-schema"
  | "function.target-for-receiver"
  | "stream.create"
  | "stream.validate"
  | "stream.is-output"
  | "tool.create"
  | "tool.copy-metadata"
  | "tool.invoke"
  | "tool.invoker-create"
  | "tool.is-target"
  | "tool.is-error-descriptor"
  | "tool.is-record"
  | "tool.has-own"
  | "tool.validate-side-effect"
  | "tool.validate-approval"
  | "tool.required-text"
  | "tool.positive-integer"
  | "tool.copy-hooks";

/** Substitutable observer for function authoring operations.
 * @example const observer: FunctionTelemetryService = { observe: (_operation, effect) => effect };
 */
export interface FunctionTelemetryService {
  /** Measures one operation while preserving the original Effect channels.
   * @param operation - Fixed operation name.
   * @param effect - Work to measure.
   * @returns Effect with the same success, error, and requirement channels.
   * @example observer.observe("tool.invoke", Effect.succeed(1));
   */
  readonly observe: <A, E, R>(
    operation: FunctionOperation,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}
