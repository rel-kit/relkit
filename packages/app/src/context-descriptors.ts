import { isEnvRef } from "@relkit/config";
import { createDescriptorBase, deepFreeze } from "@relkit/contracts";
import { createUnboundIdentityEffect, DescriptorIdentityFailure } from "@relkit/invocation";
import { Effect, Result, Schema } from "effect";
import { observeApp } from "./app-observability.js";
import type {
  ConstantsDescriptor,
  ConstantsShape,
  ContextDescriptorOptions,
  PromptDescriptor,
  PromptValue,
} from "./context-descriptors.types.js";
export * from "./context-descriptors.types.js";
/** Expected invalid constant or prompt descriptor input.
 * @example if (error._tag === "ContextDescriptorFailure") console.error(error.message);
 */
export class ContextDescriptorFailure extends Schema.TaggedError<ContextDescriptorFailure>()(
  "ContextDescriptorFailure",
  { message: Schema.String, cause: Schema.Defect() },
) {}
/** Defines a frozen constants descriptor in Effect.
 * @param values - Named JSON values, environment references, or resolver functions.
 * @param options - Optional stable descriptor identity.
 * @returns A constants descriptor or ContextDescriptorFailure.
 * @example Effect.runSync(defineConstantsEffect({ region: "eu" }));
 */
export const defineConstantsEffect = Effect.fn("App.defineConstants")(
  <const Values extends ConstantsShape>(values: Values, options: ContextDescriptorOptions = {}) =>
    observeApp(
      "constants.define",
      Effect.gen(function* () {
        if (!isRecord(values)) return yield* invalid("Constants must be an object map");
        if (!isRecord(options)) return yield* invalid("Constants options must be an object");
        for (const [key, value] of Object.entries(values)) {
          if (
            key.trim() === "" ||
            (!isEnvRef(value) && typeof value !== "function" && !(yield* isJsonEffect(value)))
          )
            return yield* invalid(`Constant "${key}" is invalid`);
        }
        const authoredId = (options as ContextDescriptorOptions).id;
        const id =
          authoredId ?? (yield* createUnboundIdentityEffect().pipe(Effect.mapError(failure)));
        return yield* Effect.try({
          try: () =>
            deepFreeze({
              ...createDescriptorBase("constants", id),
              values: { ...values },
            }) as ConstantsDescriptor<Values>,
          catch: failure,
        });
      }),
    ),
);
/** Synchronous constants descriptor adapter.
 * @param values - Named constants and resolver functions.
 * @param options - Optional stable descriptor identity.
 * @returns A frozen constants descriptor.
 * @throws The original validation error for invalid values.
 * @example defineConstants({ region: "eu" });
 */
export function defineConstants<const Values extends ConstantsShape>(
  values: Values,
  options: ContextDescriptorOptions = {},
): ConstantsDescriptor<Values> {
  return runDescriptor(defineConstantsEffect(values, options));
}
/** Defines a frozen prompt descriptor in Effect.
 * @param value - Nonempty text or ordered text fragments.
 * @param options - Optional stable descriptor identity.
 * @returns A prompt descriptor or ContextDescriptorFailure.
 * @example Effect.runSync(definePromptEffect("Be concise."));
 */
export const definePromptEffect = Effect.fn("App.definePrompt")(
  <const Value extends PromptValue>(value: Value, options: ContextDescriptorOptions = {}) =>
    observeApp(
      "prompt.define",
      Effect.gen(function* () {
        if (!isRecord(options)) return yield* invalid("Prompt options must be an object");
        const values = typeof value === "string" ? [value] : value;
        if (
          !Array.isArray(values) ||
          values.length === 0 ||
          values.some((entry) => typeof entry !== "string" || entry.trim() === "")
        )
          return yield* invalid("A prompt must contain nonempty text");
        const authoredId = (options as ContextDescriptorOptions).id;
        const id =
          authoredId ?? (yield* createUnboundIdentityEffect().pipe(Effect.mapError(failure)));
        return yield* Effect.try({
          try: () =>
            deepFreeze({
              ...createDescriptorBase("prompt", id),
              value: Array.isArray(value) ? [...value] : value,
            }) as PromptDescriptor<Value>,
          catch: failure,
        });
      }),
    ),
);
/** Synchronous prompt descriptor adapter.
 * @param value - Nonempty text or ordered text fragments.
 * @param options - Optional stable descriptor identity.
 * @returns A frozen prompt descriptor.
 * @throws The original validation error for invalid text.
 * @example definePrompt("Be concise.");
 */
export function definePrompt<const Value extends PromptValue>(
  value: Value,
  options: ContextDescriptorOptions = {},
): PromptDescriptor<Value> {
  return runDescriptor(definePromptEffect(value, options));
}
/** Checks JSON values recursively without parallelizing pure traversal. */
const isJsonEffect: (value: unknown) => Effect.Effect<boolean> = Effect.fn("App.isJson")(
  (value: unknown): Effect.Effect<boolean> =>
    Effect.gen(function* () {
      if (value === null || ["string", "boolean"].includes(typeof value)) return true;
      if (typeof value === "number") return Number.isFinite(value);
      if (Array.isArray(value)) {
        for (const entry of value) if (!(yield* isJsonEffect(entry))) return false;
        return true;
      }
      if (!isRecord(value)) return false;
      for (const entry of Object.values(value)) if (!(yield* isJsonEffect(entry))) return false;
      return true;
    }),
);
/** Turns an invalid input into a typed failure. */
function invalid(message: string): Effect.Effect<never, ContextDescriptorFailure> {
  return Effect.fail(failure(new TypeError(message)));
}
/** Retains the original validation cause for synchronous callers. */
function failure(cause: unknown): ContextDescriptorFailure {
  if (cause instanceof DescriptorIdentityFailure) cause = cause.cause;
  return new ContextDescriptorFailure({
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}
/** Runs a descriptor Effect and rethrows its original compatibility error. */
function runDescriptor<A>(effect: Effect.Effect<A, ContextDescriptorFailure>): A {
  const result = Effect.runSync(Effect.result(effect));
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
/** Checks for a non-array object record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
