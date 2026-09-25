import { Context, Data, Effect, Layer, Option } from "effect";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type { FailureDetail, FailureDetailStoreService } from "./failure-internals.types.js";

export type { FailureDetail, FailureDetailStoreService } from "./failure-internals.types.js";

/** Tagged invalid detail registry access.
 * @example Effect.catchTag(rememberFailureEffect(target, cause, undefined), "FailureDetailError", () => Effect.void);
 */
export class FailureDetailError extends Data.TaggedError("FailureDetailError")<{
  readonly cause: TypeError;
  readonly message: string;
}> {}

/** Substitutable private failure detail registry.
 * @example Effect.provide(readFailureDetailEffect(failure), FailureDetailStoreLive);
 */
export class FailureDetailStore extends Context.Service<
  FailureDetailStore,
  FailureDetailStoreService
>()("relkit/invocation/FailureDetailStore") {}

const liveStore: FailureDetailStoreService = { details: new WeakMap() };

/** Live private detail registry.
 * @example Effect.runSync(Effect.provide(readFailureDetailEffect(failure), FailureDetailStoreLive));
 */
export const FailureDetailStoreLive = Layer.succeed(FailureDetailStore, liveStore);

/** Stores private cause and stack details without exposing them on the public failure.
 * @param target - Failure object.
 * @param cause - Original internal cause.
 * @param fallbackStack - Stack used when the cause has none.
 * @returns Void or tagged invalid target error.
 * @example Effect.runSync(rememberFailureEffect(failure, cause, undefined));
 */
export function rememberFailureEffect(
  target: object,
  cause: unknown,
  fallbackStack: string | undefined,
): Effect.Effect<void, FailureDetailError> {
  return observeInvocation(
    "failure.detail-remember",
    Effect.flatMap(Effect.serviceOption(FailureDetailStore), (provided) =>
      Effect.suspend(() => {
        try {
          const stack = readStack(cause) ?? fallbackStack;
          (Option.isSome(provided) ? provided.value : liveStore).details.set(target, {
            ...(cause === undefined ? {} : { cause }),
            ...(stack === undefined ? {} : { stack }),
          });
          return Effect.void;
        } catch (cause) {
          return cause instanceof TypeError
            ? Effect.fail(new FailureDetailError({ cause, message: cause.message }))
            : Effect.die(cause);
        }
      }),
    ),
  );
}

/** Synchronous private detail store adapter.
 * @param target - Failure object.
 * @param cause - Original internal cause.
 * @param fallbackStack - Stack fallback.
 * @returns Void.
 * @throws TypeError if the target is not an object.
 * @example rememberFailure(failure, cause, undefined);
 */
export function rememberFailure(
  target: object,
  cause: unknown,
  fallbackStack: string | undefined,
): void {
  try {
    runInvocationSync(rememberFailureEffect(target, cause, fallbackStack));
  } catch (cause) {
    if (cause instanceof FailureDetailError) throw cause.cause;
    throw cause;
  }
}

/** Reads private details through an injectable registry.
 * @param target - Failure object.
 * @returns Stored details or undefined, with no expected failure.
 * @example Effect.runSync(readFailureDetailEffect(failure));
 */
export function readFailureDetailEffect(target: object): Effect.Effect<FailureDetail | undefined> {
  return observeInvocation(
    "failure.detail-read",
    Effect.flatMap(Effect.serviceOption(FailureDetailStore), (provided) =>
      Effect.sync(() => (Option.isSome(provided) ? provided.value : liveStore).details.get(target)),
    ),
  );
}

/** Synchronous private detail lookup adapter.
 * @param target - Failure object.
 * @returns Stored details or undefined.
 * @example readFailureDetail(failure);
 */
export function readFailureDetail(target: object): FailureDetail | undefined {
  return runInvocationSync(readFailureDetailEffect(target));
}

function readStack(value: unknown): string | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const property = Object.getOwnPropertyDescriptor(value, "stack");
  return property && "value" in property && typeof property.value === "string"
    ? property.value
    : undefined;
}
