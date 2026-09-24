import { Data, Effect } from "effect";
import { observeSchema, runSchemaSync } from "./schema-observability.js";
import type { SchemaOperation } from "./schema-observability.types.js";

/**
 * Tagged failure when a schema builder rejects options or its dependencies throw.
 * The original exception remains available in `cause`.
 * @example Effect.catchTag("SchemaBuilderError", (error) => Effect.succeed(error.cause));
 */
export class SchemaBuilderError extends Data.TaggedError("SchemaBuilderError")<{
  readonly cause: unknown;
}> {
  override get message(): string {
    return this.cause instanceof Error ? this.cause.message : String(this.cause);
  }
}

/**
 * Constructs a schema inside an observed Effect.
 * @param operation - Fixed builder operation name.
 * @param build - Pure schema construction callback.
 * @returns Constructed schema, or SchemaBuilderError in the error channel.
 * @example Effect.runSync(buildSchemaEffect("builder.string", () => z.string()));
 */
export function buildSchemaEffect<A>(
  operation: SchemaOperation,
  build: () => A,
): Effect.Effect<A, SchemaBuilderError> {
  return observeSchema(
    operation,
    Effect.try({
      try: build,
      catch: (cause) => new SchemaBuilderError({ cause }),
    }),
  );
}

/**
 * Runs a synchronous schema builder and preserves its original error.
 * @param operation - Fixed builder operation name.
 * @param build - Pure schema construction callback.
 * @returns Constructed schema value.
 * @throws The original construction error.
 * @example buildSchema("builder.string", () => z.string());
 */
export function buildSchema<A>(operation: SchemaOperation, build: () => A): A {
  try {
    return runSchemaSync(buildSchemaEffect(operation, build));
  } catch (error) {
    if (error instanceof SchemaBuilderError) throw error.cause;
    throw error;
  }
}
