import { Effect, Schema } from "effect";
import { AddScaffoldError } from "./add-types.js";
import { GenerateProjectError } from "./generate-types.js";
import { CreateValidationError } from "./validate-errors.js";

/** A failed native filesystem operation, retaining its original diagnostic. */
export class GeneratorIoError extends Schema.TaggedError<GeneratorIoError>()("GeneratorIoError", {
  operation: Schema.String,
  cause: Schema.Unknown,
  message: Schema.String,
}) {}

/** A failed child-process adapter operation. Command arguments are never telemetry labels. */
export class GeneratorProcessError extends Schema.TaggedError<GeneratorProcessError>()(
  "GeneratorProcessError",
  { operation: Schema.String, cause: Schema.Unknown, message: Schema.String },
) {}

/** A failed or cancelled prompt adapter operation. */
export class GeneratorPromptError extends Schema.TaggedError<GeneratorPromptError>()(
  "GeneratorPromptError",
  { cause: Schema.Unknown, message: Schema.String },
) {}

/** An expected legacy domain failure carried through a typed Effect workflow. */
export class GeneratorDomainError extends Schema.TaggedError<GeneratorDomainError>()(
  "GeneratorDomainError",
  { cause: Schema.Unknown, message: Schema.String },
) {}

/**
 * Executes a pure validation boundary without converting downstream defects or interruption.
 * @typeParam A - Validated domain value.
 * @param evaluate - Existing synchronous contract validator.
 * @returns Its value or an identity-preserving typed domain failure.
 */
export function domainTry<A>(evaluate: () => A): Effect.Effect<A, GeneratorDomainError> {
  return Effect.try({ try: evaluate, catch: (cause) => cause }).pipe(
    Effect.catch((cause) =>
      cause instanceof AddScaffoldError ||
      cause instanceof CreateValidationError ||
      cause instanceof GenerateProjectError ||
      cause instanceof SyntaxError ||
      (cause instanceof Error &&
        "code" in cause &&
        typeof cause.code === "string" &&
        cause.code.startsWith("RELKIT_"))
        ? Effect.fail(domainError(cause))
        : Effect.die(cause),
    ),
  );
}

/**
 * Carries an expected public error through internal domain composition.
 * @param cause - Original public error object.
 * @returns A schema-backed failure retaining the original object.
 */
export function domainError(cause: unknown): GeneratorDomainError {
  return new GeneratorDomainError({ cause, message: errorMessage(cause) });
}

/**
 * Restores the original rejection at a public Promise or synchronous adapter.
 * @param error - Internal typed failure or already-public rejection.
 * @returns The unchanged public error or native rejection object.
 */
export function publicFailure(error: unknown): unknown {
  return error instanceof GeneratorIoError ||
    error instanceof GeneratorProcessError ||
    error instanceof GeneratorPromptError ||
    error instanceof GeneratorDomainError
    ? publicFailure(error.cause)
    : error;
}

/**
 * Formats diagnostic text without assuming an Error instance.
 * @param cause - Boundary rejection.
 * @returns Existing message text, or the printable rejection value.
 */
export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Tests an adapter rejection's native errno without an unchecked assertion.
 * @param cause - Boundary rejection.
 * @param code - Expected native errno.
 * @returns Whether the original rejection declares that errno.
 */
export function hasErrno(cause: unknown, code: string): boolean {
  const original = publicFailure(cause);
  return original instanceof Error && "code" in original && original.code === code;
}

/**
 * Translates only existing synchronous scaffold validators into the typed channel.
 * @typeParam A - Planned value.
 * @typeParam E - Existing typed failure.
 * @typeParam R - Required services, retained unchanged.
 * @param effect - Planning operation containing pure legacy validators.
 * @returns The same operation; unexpected defects and interruption retain their causes.
 */
export function scaffoldErrors<A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | GeneratorDomainError, R> {
  return effect.pipe(
    Effect.catchDefect((error) =>
      error instanceof AddScaffoldError ? Effect.fail(domainError(error)) : Effect.die(error),
    ),
  );
}
