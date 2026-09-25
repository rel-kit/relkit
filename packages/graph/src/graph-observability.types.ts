import type { Effect } from "effect";

/** Stable operation names used for graph spans and bounded metric attributes.
 * @remarks These names are fixed by the package and never include graph IDs or user input.
 * @example const operation: GraphOperation = "diff.compare";
 */
export type GraphOperation =
  | "model.is-node-kind"
  | "model.is-edge-kind"
  | "id.graph"
  | "id.is-task-backed-job"
  | "hash.canonicalize"
  | "hash.canonical-json"
  | "hash.hash"
  | "hash.sort-nodes"
  | "hash.sort-edges"
  | "validation.graph"
  | "validation.node"
  | "validation.id"
  | "validation.is-canonical-id"
  | "validation.non-empty"
  | "validation.event-targets"
  | "validation.provider"
  | "validation.deployment-roles"
  | "validation.service"
  | "validation.telemetry"
  | "production.assert"
  | "registration.create"
  | "registration.add-node"
  | "diff.compare"
  | "diff.build"
  | "diff.node-key"
  | "diff.category"
  | "diff.contract-value"
  | "diff.changed-fields"
  | "diff.classify";

/** Replaceable instrumentation boundary for graph operations.
 * @remarks A Layer can supply this service to collect deterministic test observations.
 * @example const telemetry: GraphTelemetryService = { observe: (_name, effect) => effect };
 */
export interface GraphTelemetryService {
  /**
   * Records one operation without changing its success or error channels.
   * @param operation - Stable, bounded operation name.
   * @param effect - Operation to observe.
   * @returns The same Effect with tracing and metrics.
   * @example telemetry.observe("id.graph", Effect.succeed("task.orders.send"));
   */
  readonly observe: <A, E, R>(
    operation: GraphOperation,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}
