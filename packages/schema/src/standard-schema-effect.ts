import { Context, Data, Effect, Layer } from "effect";
import { isFailure, isPromiseLike } from "./schema-result.js";
import { observeSchema } from "./schema-observability.js";
import type { SchemaValidatorService } from "./standard-schema-effect.types.js";
import type {
  InferInput,
  InferOutput,
  StandardFailure,
  StandardResult,
  StandardSchemaV1,
} from "./standard-schema.types.js";

/**
 * Tagged failure when a value is not a Standard Schema v1 validator.
 * @example Effect.catchTag("SchemaInvalidError", (error) => Effect.succeed(error.reason));
 */
export class SchemaInvalidError extends Data.TaggedError("SchemaInvalidError")<{
  readonly reason: string;
}> {
  override get message(): string {
    return this.reason;
  }
}

/**
 * Tagged failure when a validator throws or rejects.
 * The original exception remains available in `cause`.
 * @example Effect.catchTag("SchemaExecutionError", (error) => Effect.succeed(error.cause));
 */
export class SchemaExecutionError extends Data.TaggedError("SchemaExecutionError")<{
  readonly cause: unknown;
}> {
  override get message(): string {
    return "Schema validation failed unexpectedly";
  }
}

/**
 * Tagged failure representing ordinary validation issues.
 * @example Effect.catchTag("SchemaIssuesError", (error) => Effect.succeed(error.issues));
 */
export class SchemaIssuesError extends Data.TaggedError("SchemaIssuesError")<{
  readonly issues: StandardFailure["issues"];
}> {
  override get message(): string {
    return "Schema validation failed";
  }
}

/**
 * Tagged failure when a synchronous call reaches an asynchronous validator.
 * @example Effect.catchTag("SchemaAsyncError", () => Effect.succeed(undefined));
 */
export class SchemaAsyncError extends Data.TaggedError("SchemaAsyncError")<{}> {
  override get message(): string {
    return "Schema validation is asynchronous";
  }
}

/**
 * Injectable boundary for external Standard Schema validators.
 * @example Effect.provide(validateEffect(z.string(), "ok"), SchemaValidatorLive);
 */
export class SchemaValidator extends Context.Service<SchemaValidator, SchemaValidatorService>()(
  "relkit/schema/SchemaValidator",
) {}

/**
 * Live validator Layer that delegates to the Standard Schema hook.
 * @example Effect.runPromise(Effect.provide(validateEffect(z.string(), "ok"), SchemaValidatorLive));
 */
export const SchemaValidatorLive = Layer.succeed(SchemaValidator, {
  validate: (schema, value) => schema["~standard"].validate(value),
});

/**
 * Calls a validator while retaining its synchronous or asynchronous shape.
 * @param schema - Standard Schema v1 validator.
 * @param value - Input to validate.
 * @returns An Effect containing a result or a promise of one; invalid schemas and thrown hooks are typed failures.
 * @example Effect.runSync(Effect.provide(validateMaybeEffect(z.string(), "ok"), SchemaValidatorLive));
 */
export function validateMaybeEffect<S extends StandardSchemaV1>(
  schema: S,
  value: InferInput<S>,
): Effect.Effect<
  StandardResult<InferOutput<S>> | Promise<StandardResult<InferOutput<S>>>,
  SchemaInvalidError | SchemaExecutionError,
  SchemaValidator
> {
  return Effect.gen(function* () {
    if (
      schema?.["~standard"]?.version !== 1 ||
      typeof schema["~standard"].validate !== "function"
    ) {
      return yield* Effect.fail(
        new SchemaInvalidError({ reason: "Value is not a Standard Schema v1 validator" }),
      );
    }
    const validator = yield* SchemaValidator;
    return yield* Effect.try({
      try: () => validator.validate(schema as StandardSchemaV1<unknown, InferOutput<S>>, value),
      catch: (cause) => new SchemaExecutionError({ cause }),
    });
  });
}

/**
 * Validates an input and fails with tagged errors for issues and hook failures.
 * @param schema - Standard Schema v1 validator.
 * @param value - Input to validate.
 * @returns The validated output; errors include SchemaIssuesError, SchemaInvalidError, and SchemaExecutionError.
 * @example Effect.runPromise(Effect.provide(validateEffect(z.string(), "ok"), SchemaValidatorLive));
 */
export function validateEffect<S extends StandardSchemaV1>(
  schema: S,
  value: InferInput<S>,
): Effect.Effect<
  InferOutput<S>,
  SchemaIssuesError | SchemaInvalidError | SchemaExecutionError,
  SchemaValidator
> {
  return observeSchema(
    "validate",
    Effect.flatMap(validateMaybeEffect(schema, value), (result) =>
      isPromiseLike(result)
        ? Effect.flatMap(
            Effect.tryPromise({
              try: () => Promise.resolve(result),
              catch: (cause) => new SchemaExecutionError({ cause }),
            }),
            classifyResult,
          )
        : classifyResult(result),
    ),
  );
}

/**
 * Validates without waiting and rejects asynchronous validators by tag.
 * @param schema - Standard Schema v1 validator.
 * @param value - Input to validate.
 * @returns The validated output; errors include SchemaAsyncError and other schema errors.
 * @example Effect.runSync(Effect.provide(validateSyncEffect(z.number(), 2), SchemaValidatorLive));
 */
export function validateSyncEffect<S extends StandardSchemaV1>(
  schema: S,
  value: InferInput<S>,
): Effect.Effect<
  InferOutput<S>,
  SchemaIssuesError | SchemaInvalidError | SchemaExecutionError | SchemaAsyncError,
  SchemaValidator
> {
  return observeSchema(
    "validate-sync",
    Effect.flatMap(
      validateMaybeEffect(schema, value),
      (result): Effect.Effect<InferOutput<S>, SchemaIssuesError | SchemaAsyncError> =>
        isPromiseLike(result) ? Effect.fail(new SchemaAsyncError()) : classifyResult(result),
    ),
  );
}

function classifyResult<T>(result: StandardResult<T>): Effect.Effect<T, SchemaIssuesError> {
  return isFailure(result)
    ? Effect.fail(new SchemaIssuesError({ issues: result.issues }))
    : Effect.succeed(result.value);
}
