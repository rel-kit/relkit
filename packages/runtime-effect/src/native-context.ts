import { AsyncLocalStorage } from "node:async_hooks";
import { Fiber, type Context } from "effect";

const contexts = new AsyncLocalStorage<Context.Context<never>>();

/**
 * Retains the caller's Effect dependencies while a native callback executes.
 * @typeParam A - Native result, including a Promise when the boundary is asynchronous.
 * @param context - Active fiber context captured with Effect.withFiber.
 * @param execute - Native callback invoking existing Promise or synchronous APIs.
 * @returns The callback's unchanged result; thrown errors keep their identity.
 * @remarks This transfers configuration, not ownership. Native work must finish within
 * its owning operation or use a separately owned generation/stream scope.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { withNativeEffectContext } from "@relkit/runtime-effect";
 * const call = Effect.withFiber((fiber) => Effect.tryPromise({
 *   try: () => withNativeEffectContext(fiber.context, () => Promise.resolve("done")),
 *   catch: (cause) => cause,
 * }));
 * const result = await Effect.runPromise(call);
 * ```
 */
export function withNativeEffectContext<A>(context: Context.Context<never>, execute: () => A): A {
  return contexts.run(context, execute);
}

/**
 * Reads the Effect configuration retained at the current native boundary.
 * @returns The active fiber's context, the native caller's retained context, or undefined.
 * @remarks Compatibility runners provide this context before executing nested Effects;
 * standalone callers retain their existing quiet or explicitly configured defaults.
 * An active fiber takes precedence because native callbacks may synchronously resume
 * a different fiber; asynchronous local storage must not override that fiber.
 * @see withNativeEffectContext for the checked capture example.
 */
export function currentNativeEffectContext(): Context.Context<never> | undefined {
  return Fiber.getCurrent()?.context ?? contexts.getStore();
}
