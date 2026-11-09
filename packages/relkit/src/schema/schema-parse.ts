import { Effect } from "effect";
import { observeSchema, runSchemaSync } from "./schema-observability.js";
import { isFailure, isPromiseLike } from "./schema-result.js";
import { SchemaValidationError } from "./schema-validation-error.js";
import type { SchemaParseCheck } from "./schema-parse.types.js";
import {
  SchemaAsyncError,
  SchemaExecutionError,
  SchemaIssuesError,
} from "./standard-schema-effect.js";
import type { StandardResult } from "./standard-schema.types.js";

/**
 * Parses one schema input synchronously in Effect.
 * @param check - Deferred validation callback.
 * @returns Validated output, or tagged issue, async, or execution failure.
 * @example Effect.runSync(parseSchemaSyncEffect(() => ({ value: "ok" })));
 */
export function parseSchemaSyncEffect<T>(
  check: SchemaParseCheck<T>,
): Effect.Effect<T, SchemaIssuesError | SchemaAsyncError | SchemaExecutionError> {
  return observeSchema(
    "schema.parse",
    Effect.flatMap(
      Effect.try({ try: check, catch: (cause) => new SchemaExecutionError({ cause }) }),
      (result): Effect.Effect<T, SchemaIssuesError | SchemaAsyncError> =>
        isPromiseLike(result) ? Effect.fail(new SchemaAsyncError()) : classify(result),
    ),
  );
}

/**
 * Parses synchronously while preserving compatibility exceptions.
 * @param check - Deferred validation callback.
 * @returns Validated output.
 * @throws SchemaValidationError, TypeError, or the original callback error.
 * @example parseSchemaSync(() => ({ value: "ok" }));
 */
export function parseSchemaSync<T>(check: SchemaParseCheck<T>): T {
  try {
    return runSchemaSync(parseSchemaSyncEffect(check));
  } catch (error) {
    throwParseError(error);
  }
}

/**
 * Parses one schema input asynchronously in Effect.
 * @param check - Deferred validation callback.
 * @returns Validated output, or tagged issue or execution failure.
 * @example Effect.runPromise(parseSchemaAsyncEffect(() => Promise.resolve({ value: "ok" })));
 */
export function parseSchemaAsyncEffect<T>(
  check: SchemaParseCheck<T>,
): Effect.Effect<T, SchemaIssuesError | SchemaExecutionError> {
  return observeSchema(
    "schema.parse-async",
    Effect.flatMap(
      Effect.tryPromise({
        try: () => Promise.resolve(check()),
        catch: (cause) => new SchemaExecutionError({ cause }),
      }),
      classify,
    ),
  );
}

/**
 * Parses asynchronously while preserving compatibility exceptions.
 * @param check - Deferred validation callback.
 * @returns A promise of validated output.
 * @throws SchemaValidationError or the original callback error.
 * @example await parseSchemaAsync(() => Promise.resolve({ value: "ok" }));
 */
export async function parseSchemaAsync<T>(check: SchemaParseCheck<T>): Promise<T> {
  try {
    return await Effect.runPromise(parseSchemaAsyncEffect(check));
  } catch (error) {
    throwParseError(error);
  }
}

/**
 * Validates while preserving a synchronous or asynchronous result.
 * @param check - Deferred validation callback.
 * @returns A result or promise with value or issues.
 * @throws The original callback error.
 * @example safeParseSchema(() => ({ value: "ok" }));
 */
export function safeParseSchema<T>(
  check: SchemaParseCheck<T>,
): StandardResult<T> | Promise<StandardResult<T>> {
  let result: StandardResult<T> | Promise<StandardResult<T>>;
  try {
    result = runSchemaSync(
      Effect.try({
        try: check,
        catch: (cause) => new SchemaExecutionError({ cause }),
      }),
    );
  } catch (error) {
    Effect.runSyncExit(observeSchema("schema.safe-parse", Effect.fail(error)));
    throwParseError(error);
  }
  if (isPromiseLike(result)) {
    return Effect.runPromise(
      observeSchema(
        "schema.safe-parse",
        Effect.flatMap(
          Effect.tryPromise({
            try: () => Promise.resolve(result),
            catch: (cause) => new SchemaExecutionError({ cause }),
          }),
          classify,
        ),
      ),
    ).then(
      (value) => ({ value }),
      (error) => {
        if (error instanceof SchemaIssuesError) return { issues: error.issues };
        throwParseError(error);
      },
    );
  }
  try {
    return { value: runSchemaSync(observeSchema("schema.safe-parse", classify(result))) };
  } catch (error) {
    if (error instanceof SchemaIssuesError) return { issues: error.issues };
    throwParseError(error);
  }
}

function classify<T>(result: StandardResult<T>): Effect.Effect<T, SchemaIssuesError> {
  return isFailure(result)
    ? Effect.fail(new SchemaIssuesError({ issues: result.issues }))
    : Effect.succeed(result.value);
}

function throwParseError(error: unknown): never {
  if (error instanceof SchemaIssuesError) throw new SchemaValidationError(error.issues);
  if (error instanceof SchemaAsyncError) throw new TypeError(error.message);
  if (error instanceof SchemaExecutionError) throw error.cause;
  throw error;
}
