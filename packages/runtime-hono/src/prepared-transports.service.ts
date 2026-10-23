/**
 * Owns one deferred transport initialization per prepared generation. Requests
 * share a scope-owned fiber, so cancelling an individual waiter cannot repeat
 * module evaluation or capture its context. Native import cannot be aborted;
 * retirement therefore joins it before releasing the generation's files.
 */
import { Context, Effect, Fiber, Layer, Scope } from "effect";
import type { CreateAppOptions } from "./create-app.types.js";
import { createApp } from "./create-app.js";
import { createInspectionApp } from "./create-inspection-app.js";
import { httpBoundary, observeHttp } from "./http-effect.js";
import {
  SelectedHttpTransports,
  SelectedHttpTransportsLive,
} from "./selected-transports.service.js";
import type {
  PreparedAppInitializer,
  PreparedTransportLoaderOperations,
  PreparedTransportOperations,
} from "./prepared-transports.types.js";

/** Registers joined disposal for resources installed by the legacy initializer.
 * @param app - Newly created router that has not served requests.
 * @param initialize - Optional generation-owned endpoint acquisition.
 * @param scope - Generation scope whose closure joins imports and endpoint owners.
 * @returns Lazy initialization; finalization rejection remains visible as a defect.
 */
function initializeGeneration(
  app: import("hono").Hono,
  initialize: PreparedAppInitializer | undefined,
  scope: Scope.Scope,
) {
  if (initialize === undefined) return Effect.void;
  return httpBoundary("prepared.endpoints.initialize", () => initialize(app)).pipe(
    Effect.flatMap((dispose) =>
      dispose === undefined
        ? Effect.void
        : Scope.addFinalizer(
            scope,
            observeHttp(
              "prepared.endpoints.dispose",
              httpBoundary("prepared.endpoints.dispose", dispose),
            ).pipe(Effect.orDie),
          ),
    ),
  );
}

/** Substitutable physical initialization used by live imports and test Layers. */
export class PreparedTransportLoader extends Context.Service<
  PreparedTransportLoader,
  PreparedTransportLoaderOperations
>()("relkit/http/PreparedTransportLoader") {
  /** Constructs the native import adapter without loading optional transports.
   * @returns Lazy adapter acquisition; load failures retain their native cause.
   */
  static readonly make = Effect.gen(function* () {
    const selected = yield* SelectedHttpTransports;
    return PreparedTransportLoader.of({
      prepare: selected.prepare,
      load: (options) =>
        httpBoundary("prepared.transports.import", async () => {
          return createInspectionApp(options);
        }),
    });
  });
}

/** Named adapter Layer leaves the transport implementation unloaded. */
export const PreparedTransportLoaderLive = Layer.effect(
  PreparedTransportLoader,
  PreparedTransportLoader.make,
).pipe(Layer.provide(SelectedHttpTransportsLive));

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
      const configured =
        loader.prepare === undefined
          ? options
          : yield* loader.prepare(options).pipe(Effect.uninterruptible);
      const app = createApp(configured);
      const generationContext = yield* Effect.context<never>();
      // Cache the fiber, not a request-owned join. A cancelled first request must
      // never abandon an uncancellable import and start a duplicate evaluation.
      const start = yield* Effect.cached(
        Effect.forkIn(
          observeHttp(
            "prepared.transports.initialize",
            loader
              .load(configured)
              .pipe(Effect.tap((loaded) => initializeGeneration(loaded, initialize, scope)))
              // Replacing, rather than merging, excludes the first waiter's request services.
              .pipe(Effect.setContext(generationContext)),
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
