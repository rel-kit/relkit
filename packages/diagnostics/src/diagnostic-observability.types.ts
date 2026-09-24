import type { Effect } from "effect";

/** Fixed operation names keep metric labels bounded.
 * @example const operation: DiagnosticOperation = "create";
 */
export type DiagnosticOperation =
  | "create"
  | "sort"
  | "format-one"
  | "format-many"
  | "serialize"
  | "annotations"
  | "format-annotations"
  | "reporter-create";

/** Injectable operation observer for deterministic telemetry tests.
 * The observer must preserve the wrapped Effect's channels.
 * @example const telemetry: DiagnosticTelemetryService = { observe: (_, effect) => effect };
 */
export interface DiagnosticTelemetryService {
  /**
   * Measures an operation without changing its result or error channel.
   * @param operation - Stable operation label.
   * @param effect - Work to observe.
   * @returns Observed Effect with the same success and error channels.
   * @example telemetry.observe("create", createDiagnosticEffect(input));
   */
  readonly observe: <A, E, R>(
    operation: DiagnosticOperation,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}
