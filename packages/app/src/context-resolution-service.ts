import { Context, Effect, Layer } from "effect";
import type { AppConstantRunnerService } from "./context-resolution-service.types.js";
import { ContextResolutionFailure } from "./context-resolver.js";
export type { AppConstantRunnerService } from "./context-resolution-service.types.js";
/** Replaceable boundary for dynamic constant callback execution.
 * @example Effect.provide(resolver.resolveEffect(context), AppConstantRunnerLive);
 */
export class AppConstantRunner extends Context.Service<
  AppConstantRunner,
  AppConstantRunnerService
>()("relkit/app/AppConstantRunner") {}
/** Live runner that propagates Effect interruption into callback AbortSignals.
 * @example Effect.provide(resolver.resolveEffect(context), AppConstantRunnerLive);
 */
export const AppConstantRunnerLive = Layer.succeed(AppConstantRunner, {
  run: Effect.fn("App.ConstantRunner.run")((resolver, options) =>
    Effect.tryPromise({
      try: (signal) =>
        Promise.resolve(
          resolver({ ...options, signal: AbortSignal.any([options.signal, signal]) }),
        ),
      catch: failure,
    }),
  ),
});
/** Compatibility runner that passes the caller's exact signal to callbacks. */
export const AppConstantRunnerPromiseLive = Layer.succeed(AppConstantRunner, {
  run: Effect.fn("App.ConstantRunner.runPromise")((resolver, options) =>
    Effect.tryPromise({
      try: () => Promise.resolve(resolver(options)),
      catch: failure,
    }),
  ),
});
/** Maps callback failures into the context error channel. */
function failure(cause: unknown): ContextResolutionFailure {
  return new ContextResolutionFailure({
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}
