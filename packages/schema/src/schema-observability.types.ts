import type { Effect } from "effect";

/**
 * Fixed operation names used for schema telemetry labels.
 * The union prevents input data from entering metric cardinality.
 * @example const operation: SchemaOperation = "validate";
 */
export type SchemaOperation =
  | "builder.string"
  | "builder.number"
  | "builder.boolean"
  | "builder.unknown"
  | "builder.any"
  | "builder.null"
  | "builder.undefined"
  | "builder.literal"
  | "builder.object"
  | "builder.array"
  | "builder.union"
  | "builder.file"
  | "builder.string-refine"
  | "builder.number-refine"
  | "schema.optional"
  | "schema.nullable"
  | "schema.default"
  | "schema.transform"
  | "schema.refine"
  | "validate"
  | "validate-sync"
  | "json-schema"
  | "schema.create"
  | "schema.run"
  | "schema.parse"
  | "schema.parse-async"
  | "schema.safe-parse";

/**
 * Injectable observer for schema operations.
 * A test Layer can replace the live span and metric behavior.
 * @example Layer.succeed(SchemaTelemetry, { observe: (_name, effect) => effect });
 */
export interface SchemaTelemetryService {
  /**
   * Wraps one operation without changing its Effect channels.
   * @param operation - Fixed operation name.
   * @param effect - Operation being observed.
   * @returns The observed Effect with its original success and error channels.
   * @example telemetry.observe("validate", Effect.succeed(1));
   */
  readonly observe: <A, E, R>(
    operation: SchemaOperation,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}
