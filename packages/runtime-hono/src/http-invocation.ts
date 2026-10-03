import { withNativeEffectContext } from "@relkit/runtime-effect";
import { Context, Effect, Exit, Layer } from "effect";
import { httpBoundary, HttpBoundaryError, observeHttp, runHttp } from "./http-effect.js";
import type { HttpEngine, HttpInvocationOptions } from "./materialize-routes.js";

/** Invokes the configured engine without changing its public error identity. */
export class HttpInvocation extends Context.Service<
  HttpInvocation,
  {
    readonly invoke: (request: HttpInvocationOptions) => Effect.Effect<unknown, HttpBoundaryError>;
  }
>()("@relkit/runtime-hono/HttpInvocation") {}

/** Supplies the foreign engine boundary. Tests can provide an in-memory implementation.
 * @param engine - engine supplied by the caller.
 * @returns A layer owning native invocation cancellation and settlement.
 */
export function httpInvocationLayer(engine: HttpEngine) {
  return Layer.succeed(HttpInvocation, {
    invoke: Effect.fn("HttpInvocation.invoke")((request: HttpInvocationOptions) =>
      observeHttp(
        "invocation.invoke",
        Effect.acquireUseRelease(
          Effect.sync(() => ({
            controller: new AbortController(),
            task: undefined as Promise<unknown> | undefined,
          })),
          (owned) =>
            Effect.withFiber((fiber) =>
              httpBoundary("invocation.engine", () => {
                owned.task = withNativeEffectContext(fiber.context, () =>
                  engine.invoke({
                    ...request,
                    signal:
                      request.signal === undefined
                        ? owned.controller.signal
                        : AbortSignal.any([request.signal, owned.controller.signal]),
                  }),
                );
                return owned.task;
              }),
            ),
          (owned, exit) =>
            Effect.promise(async () => {
              if (Exit.isFailure(exit)) owned.controller.abort();
              // Invocation telemetry and durable settlement belong to the native engine;
              // interruption must join them before the HTTP operation can finish.
              await owned.task?.catch(() => undefined);
            }),
        ),
      ),
    ),
  });
}

/** Promise facade used only by HTTP, oRPC, MCP, and accepted-run adapters.
 * @param engine - engine supplied by the caller.
 * @param request - Native request whose headers, body and cancellation signal define this operation.
 * @returns The engine result, rejecting with the original native failure after owned cleanup.
 */
export function invokeHttpEngine(
  engine: HttpEngine,
  request: HttpInvocationOptions,
): Promise<unknown> {
  return runHttp(
    Effect.gen(function* () {
      const invocation = yield* HttpInvocation;
      return yield* invocation.invoke(request);
    }).pipe(Effect.provide(httpInvocationLayer(engine))),
    request.signal,
  );
}
