import { Effect } from "effect";
import { SchemaImplementation } from "./schema-implementation.js";
import { throwCause } from "./schema-execution.js";
import { observeSchema, runSchemaSync } from "./schema-observability.js";
import { SchemaExecutionError } from "./standard-schema-effect.js";
import type { InternalSchema, SchemaCheck } from "./schema-impl.types.js";
import type {
  Schema,
  StandardPathSegment,
  StandardResult,
  StandardSchemaV1,
} from "./standard-schema.types.js";
import { setSchemaMetadata } from "./schema-metadata.js";
import type { SchemaMetadata } from "./schema-metadata.types.js";
import { addPath } from "./schema-impl-helpers.js";
export { SchemaValidationError } from "./schema-validation-error.js";

/**
 * Constructs a schema within an observed Effect.
 * @param check - Path-aware validator callback.
 * @param metadata - Optional projection and refinement metadata.
 * @returns A RELKIT schema, or SchemaExecutionError if construction fails.
 * @example Effect.runSync(createSchemaEffect((value) => ({ value })));
 */
export function createSchemaEffect<TInput, TOutput>(
  check: SchemaCheck<TOutput>,
  metadata: SchemaMetadata = {},
): Effect.Effect<Schema<TInput, TOutput>, SchemaExecutionError> {
  return observeSchema(
    "schema.create",
    Effect.try({
      try: () => {
        const schema = new SchemaImplementation<TInput, TOutput>(check, metadata);
        setSchemaMetadata(schema, metadata);
        return schema;
      },
      catch: (cause) => new SchemaExecutionError({ cause }),
    }),
  );
}

/**
 * Synchronous compatibility adapter for schema construction.
 * @param check - Path-aware validator callback.
 * @param metadata - Optional projection metadata.
 * @returns A RELKIT schema.
 * @throws The original construction error if creation fails.
 * @example createSchema((value) => ({ value }));
 */
export function createSchema<TInput, TOutput>(
  check: SchemaCheck<TOutput>,
  metadata: SchemaMetadata = {},
): Schema<TInput, TOutput> {
  try {
    return runSchemaSync(createSchemaEffect<TInput, TOutput>(check, metadata));
  } catch (error) {
    throwCause(error);
  }
}

/**
 * Evaluates a schema while preserving its synchronous or asynchronous result.
 * @param schema - Schema to evaluate.
 * @param value - Input value.
 * @param path - Prefix for nested issue paths.
 * @returns A result or promise of a result, with typed execution failure.
 * @example Effect.runSync(runSchemaEffect(z.string(), "ok"));
 */
export function runSchemaEffect<TOutput>(
  schema: StandardSchemaV1<unknown, TOutput>,
  value: unknown,
  path: readonly StandardPathSegment[] = [],
): Effect.Effect<StandardResult<TOutput> | Promise<StandardResult<TOutput>>, SchemaExecutionError> {
  return observeSchema(
    "schema.run",
    Effect.try({
      try: () => {
        const internal = schema as Partial<InternalSchema<unknown, TOutput>>;
        if (typeof internal._run === "function") return internal._run(value, path);
        return addPath(schema["~standard"].validate(value), path);
      },
      catch: (cause) => new SchemaExecutionError({ cause }),
    }),
  );
}

/**
 * Compatibility adapter for path-aware schema validation.
 * @param schema - Schema to evaluate.
 * @param value - Input value.
 * @param path - Prefix for nested issue paths.
 * @returns A result or promise of a result.
 * @throws The original validator error if evaluation fails.
 * @example runSchema(z.string(), "ok", ["name"]);
 */
export function runSchema<TOutput>(
  schema: StandardSchemaV1<unknown, TOutput>,
  value: unknown,
  path: readonly StandardPathSegment[] = [],
): StandardResult<TOutput> | Promise<StandardResult<TOutput>> {
  try {
    return runSchemaSync(runSchemaEffect(schema, value, path));
  } catch (error) {
    throwCause(error);
  }
}
