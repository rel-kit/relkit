import { Effect } from "effect";
import { observeSchema, runSchemaSync } from "./schema-observability.js";
import { failure, isFailure, isPromiseLike } from "./schema-result.js";
import {
  SchemaAsyncError,
  SchemaExecutionError,
  SchemaInvalidError,
  SchemaIssuesError,
  SchemaValidatorLive,
  validateMaybeEffect,
  validateSyncEffect,
} from "./standard-schema-effect.js";
import type {
  InferInput,
  InferOutput,
  StandardFailure,
  StandardPathSegment,
  StandardResult,
  StandardSchemaV1,
} from "./standard-schema.types.js";

export type {
  InferInput,
  InferOutput,
  JsonValue,
  RelkitSchema,
  Schema,
  StandardFailure,
  StandardIssue,
  StandardJSONSchemaV1,
  StandardPathSegment,
  StandardResult,
  StandardSchemaOptions,
  StandardSchemaTypes,
  StandardSchemaV1,
  StandardSuccess,
} from "./standard-schema.types.js";
export { isPromiseLike } from "./schema-result.js";

/**
 * Validates with a Standard Schema v1 compatible validator.
 * @param schema - Validator to execute.
 * @param value - Input accepted by the validator.
 * @returns A validation result, or a promise when validation is asynchronous.
 * @throws TypeError when the validator does not implement Standard Schema v1.
 * @example
 * ```ts
 * import { validate, z } from "@relkit/app/schema";
 *
 * const result = await validate(z.string(), "ready");
 * if (!("value" in result)) throw new Error("validation failed");
 * ```
 * @category Validation
 * @since 0.1.0
 */
export function validate<S extends StandardSchemaV1>(
  schema: S,
  value: InferInput<S>,
): StandardResult<InferOutput<S>> | Promise<StandardResult<InferOutput<S>>> {
  let result: StandardResult<InferOutput<S>> | Promise<StandardResult<InferOutput<S>>>;
  try {
    result = runSchemaSync(Effect.provide(validateMaybeEffect(schema, value), SchemaValidatorLive));
  } catch (error) {
    Effect.runSyncExit(observeSchema("validate", Effect.fail(error)));
    throwCompatibilityError(error);
  }
  if (isPromiseLike(result)) {
    return Effect.runPromise(
      observeSchema(
        "validate",
        Effect.tryPromise({
          try: () => Promise.resolve(result),
          catch: (cause) => new SchemaExecutionError({ cause }),
        }).pipe(
          Effect.flatMap(resultToEffect),
          Effect.catchTag("SchemaIssuesError", (error) => Effect.succeed({ issues: error.issues })),
        ),
      ),
    ).catch(throwCompatibilityError);
  }
  return runSchemaSync(
    observeSchema("validate", resultToEffect(result)).pipe(
      Effect.catchTag("SchemaIssuesError", (error) => Effect.succeed({ issues: error.issues })),
    ),
  );
}

/**
 * Validates synchronously with a Standard Schema v1 compatible validator.
 * @param schema - Validator to execute.
 * @param value - Input accepted by the validator.
 * @returns The synchronous validation result.
 * @throws TypeError when the validator is invalid or asynchronous.
 * @example const result = validateSync(z.number(), 3);
 */
export function validateSync<S extends StandardSchemaV1>(
  schema: S,
  value: InferInput<S>,
): StandardResult<InferOutput<S>> {
  try {
    return {
      value: runSchemaSync(Effect.provide(validateSyncEffect(schema, value), SchemaValidatorLive)),
    };
  } catch (error) {
    if (error instanceof SchemaIssuesError) return { issues: error.issues };
    throwCompatibilityError(error);
  }
}

export { SchemaValidationError, createSchema, runSchema } from "./schema-impl.js";

/**
 * Constructs a portable validation failure at a schema path.
 * @param message - Human readable validation message.
 * @param path - Path to the invalid input.
 * @returns A Standard Schema failure result.
 * @example issue("Expected a string", ["name"]);
 */
export function issue(message: string, path: readonly StandardPathSegment[]): StandardFailure {
  return failure(message, path);
}

function resultToEffect<T>(
  result: StandardResult<T>,
): Effect.Effect<StandardResult<T>, SchemaIssuesError> {
  return isFailure(result)
    ? Effect.fail(new SchemaIssuesError({ issues: result.issues }))
    : Effect.succeed(result);
}

function throwCompatibilityError(error: unknown): never {
  if (error instanceof SchemaInvalidError || error instanceof SchemaAsyncError) {
    throw new TypeError(error.message);
  }
  if (error instanceof SchemaExecutionError) throw error.cause;
  throw error;
}
