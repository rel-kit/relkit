import { isStreamOutput, lazySingleConsumerStream } from "@relkit/invocation";
import { observeExecution, observeExecutionStream } from "@relkit/runtime-effect";
import { Context, Effect, Exit, Layer, Stream } from "effect";
import { enginePromise, engineTry, runEnginePromise } from "./engine-runtime.js";
import { invocationTerminal } from "./invocation-observation.js";
import { invokeNow } from "./invoke-now.js";
import type { InvocationContext, InvokeOptions } from "./invoke-types.js";
import { canonicalTarget, resolveTarget } from "./invoke-utils.js";
import type { InvocationOperations } from "./invoke.service.types.js";

export * from "./invoke-types.js";

/** Invocation authority at the plain handler/Effect kernel boundary.
 * @example
 * ```ts
 * // Given `options: InvokeOptions` with a validated target:
 * const program = Effect.gen(function* () {
 *   const invocation = yield* InvocationService;
 *   return yield* invocation.invoke(options);
 * }).pipe(Effect.provide(InvocationLive));
 * await Effect.runPromise(program);
 * ```
 */
export class InvocationService extends Context.Service<InvocationService, InvocationOperations>()(
  "@relkit/engine/Invocation",
) {}

/** Execute the invocation Effect with the caller's configured runtime and preserve public failures.
 * @typeParam Input - Declared target input.
 * @typeParam Output - Declared target output, including lazy streams.
 * @typeParam Context - Public handler context with cancellation authority.
 * @param options - Target, input, generation dependencies and hook configuration.
 * @param onSuspension - Internal task observation bridge; notified for nonterminal continuation.
 * @returns A lazy effect yielding the validated output or the original failure.
 * @remarks The owning service records once. Native suspension omits terminal outcomes.
 * Returned streams begin observation at first pull and retain their consumption lifetime.
 * @see {@link InvocationService} for a provisioning example.
 */
export const invokeEffect = Effect.fn("Engine.invocation.invoke")(function* <
  Input = unknown,
  Output = unknown,
  Context extends { readonly signal: AbortSignal } = InvocationContext,
>(options: InvokeOptions<Input, Output, Context>, onSuspension?: () => void) {
  const inspected = yield* Effect.exit(engineTry(() => canonicalTarget(resolveTarget(options))));
  if (Exit.isFailure(inspected))
    return yield* observeExecution(
      "engine",
      "invocation.invoke",
      Effect.failCause(inspected.cause),
      undefined,
      invocationTerminal,
    );
  const target = inspected.value;
  if (!isStreamOutput(target.output)) {
    let running: Promise<Output> | undefined;
    let suspended = false;
    return yield* observeExecution(
      "engine",
      "invocation.invoke",
      enginePromise((signal) => {
        running = invokeNow(
          {
            ...options,
            signal:
              options.signal === undefined ? signal : AbortSignal.any([signal, options.signal]),
          },
          false,
          invoke,
          () => {
            suspended = true;
            onSuspension?.();
          },
        );
        return running;
      }).pipe(
        Effect.ensuring(
          Effect.promise(async () => {
            // The native invocation owns admission and hooks. Wait for its abort cleanup
            // before declaring the calling fiber interrupted.
            await running?.then(
              () => undefined,
              () => undefined,
            );
          }),
        ),
      ),
      undefined,
      (exit) => invocationTerminal(exit, suspended),
    );
  }
  const controller = new AbortController();
  let openFailed = false;
  let suspended = false;
  let claimed = false;
  const source = lazySingleConsumerStream(async () => {
    try {
      return (await invokeNow(
        {
          ...options,
          target,
          signal:
            options.signal === undefined
              ? controller.signal
              : AbortSignal.any([options.signal, controller.signal]),
        },
        true,
        invoke,
        () => {
          suspended = true;
          onSuspension?.();
        },
      )) as AsyncIterable<unknown>;
    } catch (cause) {
      openFailed = true;
      throw cause;
    }
  });
  const ownedSource: AsyncIterable<unknown> = {
    [Symbol.asyncIterator]() {
      const iterator = source[Symbol.asyncIterator]();
      const owner = !claimed;
      claimed = true;
      return {
        next: () => iterator.next(),
        /** Abort pending source work and join its native settlement.
         * @param value - Optional return value supplied by the consumer.
         * @returns The source's return result, or completion when opening already failed.
         */
        async return(value?: unknown) {
          if (owner) controller.abort();
          try {
            return (await iterator.return?.(value)) ?? { done: true, value };
          } catch (cause) {
            // Failed opening has no iterator to release. Its failure was already
            // delivered by next; replaying it from cleanup would add a false defect.
            if (owner && openFailed) return { done: true, value };
            throw cause;
          }
        },
      };
    },
  };
  const context = yield* Effect.context<never>();
  const stream = observeExecutionStream(
    "engine",
    "invocation.invoke",
    Stream.fromAsyncIterable(ownedSource, (cause) => cause),
    undefined,
    (exit) => invocationTerminal(exit, suspended),
  );
  const observed = Stream.toAsyncIterableWith(stream, context);
  let consumerClaimed = false;
  return {
    [Symbol.asyncIterator]() {
      const iterator = observed[Symbol.asyncIterator]();
      let started = false;
      let owner = false;
      return {
        /** Claim consumption once and request the next validated item.
         * @returns The next item or the original stream failure.
         */
        next() {
          if (!started) {
            started = true;
            owner = !consumerClaimed;
            consumerClaimed = true;
          }
          return iterator.next();
        },
        /** Abort before joining a pull that may own the source's return semaphore.
         * @param value - Optional native return value.
         * @returns Completion after the consumer's resources have settled.
         */
        return(value?: unknown) {
          if (owner) controller.abort();
          return iterator.return?.(value) ?? Promise.resolve({ done: true, value });
        },
        /** Stop owned native work before closing the Effect iterator with a failure.
         * @param error - Original consumer failure and cancellation reason.
         * @returns A rejected Promise preserving the consumer's failure.
         */
        throw(error?: unknown) {
          if (owner) controller.abort(error);
          return iterator.throw?.(error) ?? Promise.reject(error);
        },
      };
    },
  } as Output;
});

/** Live invocation operations; caller options provide generation-specific authority. */
export const InvocationLive = Layer.effect(
  InvocationService,
  Effect.gen(function* () {
    return InvocationService.of({ invoke: invokeEffect });
  }),
);

/** Execute the invocation Effect with the caller's configured runtime and preserve public failures.
 * @typeParam Input - Validated handler input type.
 * @typeParam Output - Validated handler output type.
 * @typeParam Context - Handler context carrying cancellation authority.
 * @returns A Promise of validated output, retaining original public failure identity.
 * @param options - Explicit configuration and dependencies for this operation.
 */
export async function invoke<
  Input = unknown,
  Output = unknown,
  Context extends { readonly signal: AbortSignal } = InvocationContext,
>(options: InvokeOptions<Input, Output, Context>): Promise<Output> {
  return runEnginePromise(invokeEffect(options), undefined, options.effectRunner ?? options.bridge);
}

export { invokeFunction } from "./invoke-function.js";
