import { Data, Effect } from "effect";
import { getMetadataProjection } from "./schema-metadata.js";
import { runSchemaSync } from "./schema-observability.js";
import { isFailure, mapResult } from "./schema-result.js";
import type { SchemaMetadata } from "./schema-metadata.types.js";
import type {
  StandardJSONSchemaV1,
  StandardPathSegment,
  StandardResult,
} from "./standard-schema.types.js";

/**
 * Tagged failure for an unsupported target or missing projection.
 * The original exception remains available in `cause`.
 * @example Effect.catchTag("SchemaProjectionError", (error) => Effect.succeed(error.cause));
 */
export class SchemaProjectionError extends Data.TaggedError("SchemaProjectionError")<{
  readonly cause: unknown;
}> {}

/**
 * Projects metadata through a Standard JSON Schema hook inside Effect.
 * @param metadata - Attached schema metadata.
 * @param direction - Input or output projection.
 * @param target - Requested JSON Schema dialect.
 * @returns A JSON object, or SchemaProjectionError.
 * @example Effect.runSync(projectJsonSchemaEffect({ jsonSchema: () => ({}) }, "input", "draft-07"));
 */
export function projectJsonSchemaEffect(
  metadata: SchemaMetadata,
  direction: "input" | "output",
  target: StandardJSONSchemaV1.Options["target"],
): Effect.Effect<Record<string, unknown>, SchemaProjectionError> {
  return Effect.try({
    try: () => {
      if (target !== "draft-2020-12" && target !== "draft-07" && target !== "openapi-3.0") {
        throw new TypeError(`Unsupported JSON Schema target "${target}"`);
      }
      const value = getMetadataProjection(metadata, direction)?.();
      if (
        value === undefined ||
        value === null ||
        Array.isArray(value) ||
        typeof value !== "object"
      ) {
        throw new TypeError("Schema does not expose a deterministic JSON Schema projection");
      }
      return value as Record<string, unknown>;
    },
    catch: (cause) => new SchemaProjectionError({ cause }),
  });
}

/**
 * Projects metadata through a Standard JSON Schema hook.
 * @param metadata - Attached schema metadata.
 * @param direction - Input or output projection.
 * @param target - Requested JSON Schema dialect.
 * @returns A JSON object for the requested dialect.
 * @throws TypeError for an unsupported target or absent projection.
 * @example projectJsonSchema({ jsonSchema: () => ({}) }, "input", "draft-07");
 */
export function projectJsonSchema(
  metadata: SchemaMetadata,
  direction: "input" | "output",
  target: StandardJSONSchemaV1.Options["target"],
): Record<string, unknown> {
  try {
    return runSchemaSync(projectJsonSchemaEffect(metadata, direction, target));
  } catch (error) {
    if (error instanceof SchemaProjectionError) throw error.cause;
    throw error;
  }
}

/**
 * Prefixes issues from a nested third-party validator in Effect.
 * @param result - Synchronous or asynchronous validation result.
 * @param path - Prefix for nested issues.
 * @returns An Effect containing the result with prefixed issue paths.
 * @example Effect.runSync(addPathEffect({ issues: [{ message: "bad" }] }, ["item"]));
 */
export function addPathEffect<T>(
  result: StandardResult<T> | Promise<StandardResult<T>>,
  path: readonly StandardPathSegment[],
): Effect.Effect<StandardResult<T> | Promise<StandardResult<T>>> {
  return Effect.sync(() =>
    mapResult(result, (resolved) => {
      if (!isFailure(resolved) || path.length === 0) return resolved;
      return {
        issues: resolved.issues.map((issue) => ({
          ...issue,
          path: [...path, ...(issue.path ?? [])],
        })),
      };
    }),
  );
}

/**
 * Prefixes nested issues without changing sync/async shape.
 * @param result - Synchronous or asynchronous validation result.
 * @param path - Prefix for nested issues.
 * @returns The result with prefixed paths.
 * @example addPath({ issues: [{ message: "bad" }] }, ["item"]);
 */
export function addPath<T>(
  result: StandardResult<T> | Promise<StandardResult<T>>,
  path: readonly StandardPathSegment[],
): StandardResult<T> | Promise<StandardResult<T>> {
  return runSchemaSync(addPathEffect(result, path));
}
