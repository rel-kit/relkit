import { Cause, Data, Effect, Exit } from "effect";
import { validate } from "@relkit/schema";
import { InvocationValidationError } from "./contracts.js";
import { unexpectedDefect } from "./failure.js";
import { getDescriptorIdentity } from "./identity.js";
import { observeInvocation } from "./invocation-observability.js";
import type {
  InvocationErrorDefinition,
  InvocationFailure,
  StandardResult,
  StandardSchemaV1,
} from "./validation-schema.types.js";

/** A schema validation or validator execution failure in the Effect channel.
 * @example Effect.catchTag(validatedEffect(schema, input, "input"), "SchemaValidationFailure", () => Effect.void);
 */
export class SchemaValidationFailure extends Data.TaggedError("SchemaValidationFailure")<{
  readonly phase: "input" | "output";
  readonly cause: unknown;
  readonly message: string;
}> {}

/** Validates an invocation value with a tagged failure.
 * @param schema - Standard Schema to run.
 * @param value - Candidate value.
 * @param phase - Input or output validation phase.
 * @returns The parsed value or `SchemaValidationFailure`.
 * @example await Effect.runPromise(validatedEffect(schema, input, "input"));
 */
export function validatedEffect(
  schema: StandardSchemaV1,
  value: unknown,
  phase: "input" | "output",
): Effect.Effect<unknown, SchemaValidationFailure> {
  return observeInvocation(
    "validation.schema",
    Effect.gen(function* () {
      const result = yield* Effect.tryPromise({
        try: () =>
          Promise.resolve(validate(schema, value as never)) as Promise<StandardResult<unknown>>,
        catch: (cause) =>
          new SchemaValidationFailure({
            phase,
            cause: unexpectedDefect(cause),
            message: "Schema validator failed",
          }),
      });
      if (!("value" in result))
        return yield* Effect.fail(
          new SchemaValidationFailure({
            phase,
            cause: new InvocationValidationError(phase, result.issues),
            message: `${phase} validation failed`,
          }),
        );
      return result.value;
    }),
  );
}

/** Promise compatibility adapter for Standard Schema validation.
 * @param schema - Standard Schema to run.
 * @param value - Candidate value.
 * @param phase - Input or output validation phase.
 * @returns The parsed value.
 * @throws InvocationValidationError for issues, or the established unexpected defect.
 * @example await validated(schema, input, "input");
 */
export async function validated(
  schema: StandardSchemaV1,
  value: unknown,
  phase: "input" | "output",
): Promise<unknown> {
  try {
    return await Effect.runPromise(validatedEffect(schema, value, phase));
  } catch (cause) {
    if (cause instanceof SchemaValidationFailure) throw cause.cause;
    throw cause;
  }
}

/** Invokes an observational hook; its failure cannot replace an invocation result.
 * @param hook - Optional callback.
 * @param value - Callback value.
 * @returns Void with no expected failure; hook failures are intentionally ignored.
 * @example await Effect.runPromise(callHookEffect(onStart, record));
 */
export function callHookEffect<T>(
  hook: ((value: T) => unknown) | undefined,
  value: T,
): Effect.Effect<void> {
  return observeInvocation(
    "validation.hook",
    Effect.ignore(
      Effect.tryPromise({
        try: async () => {
          await hook?.(value);
        },
        catch: (cause) => cause,
      }),
    ),
  );
}

/** Promise compatibility adapter for an observational hook.
 * @param hook - Optional callback.
 * @param value - Callback value.
 * @returns Void after the callback settles.
 * @example await callHook(onStart, record);
 */
export function callHook<T>(hook: ((value: T) => unknown) | undefined, value: T): Promise<void> {
  return Effect.runPromise(callHookEffect(hook, value));
}

/** Validates a declared application error's data without replacing the original error.
 * @param definitions - Declared error schemas.
 * @param error - Candidate invocation error.
 * @returns The original error, or an unexpected defect for undeclared or invalid data.
 * @example await Effect.runPromise(validateDeclaredErrorEffect(definitions, failure));
 */
export function validateDeclaredErrorEffect(
  definitions: readonly InvocationErrorDefinition[] | undefined,
  error: InvocationValidationError | InvocationFailure,
): Effect.Effect<InvocationValidationError | InvocationFailure> {
  return observeInvocation(
    "validation.declared-error",
    Effect.gen(function* () {
      if (error instanceof InvocationValidationError || error.kind !== "application") return error;
      const checked = yield* Effect.exit(
        Effect.tryPromise({
          try: async () => {
            const definition = definitions?.find(
              (candidate) => getDescriptorIdentity(candidate as object) === error.id,
            );
            if (definition === undefined) throw new Error("Undeclared application error");
            return (await validate(
              definition.data,
              error.data as never,
            )) as StandardResult<unknown>;
          },
          catch: (cause) => cause,
        }),
      );
      if (Exit.isFailure(checked)) return unexpectedDefect(Cause.squash(checked.cause));
      return "value" in checked.value
        ? error
        : unexpectedDefect(new Error("Invalid declared error data"));
    }),
  );
}

/** Promise compatibility adapter for declared error validation.
 * @param definitions - Declared error schemas.
 * @param error - Candidate invocation error.
 * @returns The original or normalized defect failure.
 * @example await validateDeclaredError(definitions, failure);
 */
export function validateDeclaredError(
  definitions: readonly InvocationErrorDefinition[] | undefined,
  error: InvocationValidationError | InvocationFailure,
): Promise<InvocationValidationError | InvocationFailure> {
  return Effect.runPromise(validateDeclaredErrorEffect(definitions, error));
}
