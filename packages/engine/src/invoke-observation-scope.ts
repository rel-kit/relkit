import { withNativeEffectContext } from "@relkit/runtime-effect";
import { Effect, Exit, FiberSet, Scope } from "effect";
import { enginePromise, runEnginePromise } from "./engine-runtime.js";
import type { InvocationHooks } from "./invoke-types.js";

/** Own asynchronous compatibility observations until invocation or stream termination.
 * @typeParam Context - Public handler context carrying cancellation authority.
 * @param hooks - Optional caller-provided lifecycle and observability callbacks.
 * @returns A Promise for scoped hook adapters and their idempotent close operation.
 * @remarks Scope closure interrupts observation fibers. Legacy callbacks have no abort
 * parameter, so their external side effects cannot be forcibly cancelled. Awaited
 * lifecycle hooks retain their ordering; span and edge callbacks run under this owner.
 */
export async function createObservationScope<Context extends { readonly signal: AbortSignal }>(
  hooks: InvocationHooks<Context> | undefined,
) {
  if (hooks === undefined) return { hooks, close: async () => undefined };
  const scope = Scope.makeUnsafe();
  const { run, context } = await runEnginePromise(
    Effect.withFiber((fiber) =>
      FiberSet.makeRuntimePromise<never, void, never>().pipe(
        Effect.map((run) => ({ run, context: fiber.context })),
        Effect.provideService(Scope.Scope, scope),
      ),
    ),
  );
  let closed = false;
  /** Invoke an advisory callback immediately and supervise only its asynchronous result.
   * @param work - Caller observation run under the captured native Effect context.
   * @returns Nothing for synchronous or closed observations; otherwise an isolated owned Promise.
   */
  const observe = (work: () => unknown): void | Promise<void> => {
    if (closed) return;
    try {
      const result = withNativeEffectContext(context, work);
      if (
        result === null ||
        (typeof result !== "object" && typeof result !== "function") ||
        !("then" in result) ||
        typeof result.then !== "function"
      )
        return;
      return run(
        enginePromise(() => Promise.resolve(result)).pipe(
          Effect.asVoid,
          Effect.catch(() => Effect.void),
        ),
      ).catch(() => undefined);
    } catch {
      // Advisory observers cannot change the invocation result.
    }
  };
  const wrapped: InvocationHooks<Context> = {
    ...hooks,
    ...(hooks.observability === undefined
      ? {}
      : {
          observability: {
            ...hooks.observability,
            emit: (event) => observe(() => hooks.observability!.emit(event)),
          },
        }),
    ...(hooks.onSpanStart === undefined
      ? {}
      : {
          onSpanStart: (value) => {
            void observe(() => hooks.onSpanStart!(value));
          },
        }),
    ...(hooks.onSpanComplete === undefined
      ? {}
      : {
          onSpanComplete: (value) => {
            void observe(() => hooks.onSpanComplete!(value));
          },
        }),
    ...(hooks.onDeclaredEdge === undefined
      ? {}
      : {
          onDeclaredEdge: (value) => {
            void observe(() => hooks.onDeclaredEdge!(value));
          },
        }),
    ...(hooks.onObservedEdge === undefined
      ? {}
      : {
          onObservedEdge: (value) => {
            void observe(() => hooks.onObservedEdge!(value));
          },
        }),
    ...(hooks.onOperation === undefined
      ? {}
      : {
          onOperation: (value) => {
            void observe(() => hooks.onOperation!(value));
          },
        }),
  };
  return {
    hooks: wrapped,
    close: () => {
      closed = true;
      return runEnginePromise(Scope.close(scope, Exit.void));
    },
  };
}
