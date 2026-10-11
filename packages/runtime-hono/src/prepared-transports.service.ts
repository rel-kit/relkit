/**
 * Owns one deferred transport initialization per prepared generation. Requests
 * share a scope-owned fiber, so cancelling an individual waiter cannot repeat
 * module evaluation or capture its context. Native import cannot be aborted;
 * retirement therefore joins it before releasing the generation's files.
 */
import { Context, Effect, Fiber, Layer, Scope } from "effect";
import type { CreateAppOptions } from "./create-app.types.js";
import { createRestApp } from "./create-rest-app.js";
import { httpBoundary, observeHttp } from "./http-effect.js";
import type {
  PreparedAppInitializer,
  PreparedTransportLoaderOperations,
  PreparedTransportOperations,
} from "./prepared-transports.types.js";

/** Substitutable physical initialization used by live imports and test Layers. */
export class PreparedTransportLoader extends Context.Service<
  PreparedTransportLoader,
  PreparedTransportLoaderOperations
>()("relkit/http/PreparedTransportLoader") {
  /** Constructs the native import adapter without loading optional transports.
   * @returns Lazy adapter acquisition; load failures retain their native cause.
   */
  static readonly make = Effect.succeed(
    PreparedTransportLoader.of({
      load: (options) =>
        httpBoundary("prepared.transports.import", async () => {
          const module = await import("./create-app.js");
          return module.createApp(options);
        }),
    }),
  );
}

/** Named adapter Layer leaves the transport implementation unloaded. */
export const PreparedTransportLoaderLive = Layer.effect(
  PreparedTransportLoader,
  PreparedTransportLoader.make,
);

/** Generation-owned REST application and single-flight deferred transport state. */
export class PreparedTransports extends Context.Service<
  PreparedTransports,
  PreparedTransportOperations
>()("relkit/http/PreparedTransports") {
  /** Acquires one generation's shared REST policy and deferred loader.
   * @param options - Complete validated cohort, without request-specific state.
   * @returns Scoped service; native shell failures remain typed and loading stays lazy.
   */
  static readonly make = (options: CreateAppOptions, initialize?: PreparedAppInitializer) =>
    Effect.gen(function* () {
      const loader = yield* PreparedTransportLoader;
      const scope = yield* Scope.Scope;
      const app = createRestApp(options);
      // Cache the fiber, not a request-owned join. A cancelled first request must
      // never abandon an uncancellable import and start a duplicate evaluation.
      const start = yield* Effect.cached(
        Effect.forkIn(
          observeHttp(
            "prepared.transports.initialize",
            loader
              .load(options)
              .pipe(
                Effect.tap((loaded) =>
                  initialize === undefined
                    ? Effect.void
                    : httpBoundary("prepared.endpoints.initialize", () => initialize(loaded)),
                ),
              ),
          ).pipe(Effect.uninterruptible),
          scope,
        ),
      );
      const load = Effect.fn("PreparedTransports.load")(() =>
        observeHttp("prepared.transports.load", start.pipe(Effect.flatMap(Fiber.join))),
      );
      return PreparedTransports.of({ app, load });
    });
}
