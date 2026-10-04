import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer, Ref, Scope } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { createTestHttpListener } from "./http-listener.js";
import { joinOwnedWork, runOwnedContext } from "./work-ownership.js";
import type { HttpOwnerService, HttpOwnerState, HttpPlatformService } from "./http-owner.types.js";
import type { TestHttpListenerOptions } from "./http-listener.js";
import type { TestHttpApplication, TestHttpClientOptions } from "./http.js";

/** Native listener acquisition; tests substitute failures without opening real sockets. */
export class TestHttpPlatform extends Context.Service<TestHttpPlatform, HttpPlatformService>()(
  "relkit/testing/HttpPlatform",
) {}

export const TestHttpPlatformLive = Layer.succeed(
  TestHttpPlatform,
  TestHttpPlatform.of({ listen: createTestHttpListener }),
);

/** Listener admission, startup races and complete shutdown belong to one client owner. */
export class TestHttpOwner extends Context.Service<TestHttpOwner, HttpOwnerService>()(
  "relkit/testing/HttpOwner",
) {}

/**
 * Owns listener admission, late startup adoption and complete release as Effect decisions.
 * @param app In-memory application exposed by each native server.
 * @param options Close deadline and owner shutdown callback.
 * @returns A scoped client service requiring a substitutable native listener platform.
 * @remarks Owned startup joins native completion even after its caller stops waiting.
 */
export function httpOwnerLayer(app: TestHttpApplication, options: TestHttpClientOptions) {
  return Layer.effect(
    TestHttpOwner,
    Effect.acquireRelease(
      Effect.gen(function* () {
        const platform = yield* TestHttpPlatform;
        // Owner close joins actual startup before this worker scope is retired.
        const scope = yield* Effect.acquireRelease(Scope.make(), (scope) =>
          Scope.close(scope, Exit.void),
        );
        const context = yield* Effect.context<never>();
        const state = Ref.makeUnsafe<HttpOwnerState>({
          closed: false,
          listeners: new Set(),
          pending: new Set(),
          startupReleaseFailures: [],
          closing: undefined,
        });

        /**
         * Bridges one native listener/callback operation without hiding its orchestration.
         * @typeParam A Native completion value.
         * @param work One native Promise operation.
         * @returns Its original result or rejection identity.
         */
        const native = <A>(work: () => Promise<A>) =>
          Effect.tryPromise({ try: work, catch: (cause) => cause });

        /** Joins startup, attempts every release and callback, then retains the first failure. */
        const close = Effect.uninterruptible(
          Effect.fn("Testing.http.close")(function* () {
            const current = yield* Ref.get(state);
            if (current.closing !== undefined) return yield* native(() => current.closing!);
            const done = yield* Deferred.make<void, unknown>();
            current.closing = runOwnedContext(context, Deferred.await(done));
            void current.closing.catch(() => undefined);
            current.closed = true;
            return yield* observeExecution(
              "testing",
              "http.close",
              Effect.gen(function* () {
                yield* joinOwnedWork(current.pending);
                const releases = yield* Effect.forEach(
                  [...current.listeners],
                  (listener) => Effect.exit(native(() => listener.close())),
                  { concurrency: "unbounded" },
                );
                current.listeners.clear();
                const callback = yield* Effect.exit(
                  native(() => Promise.resolve(options.onClose?.())),
                );
                const failure = releases.find(Exit.isFailure);
                if (failure !== undefined) return yield* Effect.fail(Cause.squash(failure.cause));
                if (current.startupReleaseFailures.length > 0)
                  return yield* Effect.fail(current.startupReleaseFailures[0]);
                if (Exit.isFailure(callback))
                  return yield* Effect.fail(Cause.squash(callback.cause));
              }),
            ).pipe(Effect.onExit((exit) => Deferred.done(done, exit)));
          })(),
        );

        /**
         * Registers independent startup before allowing the caller to stop waiting.
         * @param listenerOptions Explicit native bind identity and close policy.
         * @returns The adopted listener or original late-close/acquisition failure.
         */
        const listen = Effect.fn("Testing.http.listen")(
          (listenerOptions: TestHttpListenerOptions = {}) =>
            Effect.uninterruptibleMask((restore) =>
              Effect.gen(function* () {
                const current = yield* Ref.get(state);
                if (current.closed)
                  return yield* Effect.fail(new Error("Test HTTP client is closed"));
                const fiber = yield* Effect.forkIn(
                  observeExecution(
                    "testing",
                    "http.listen",
                    Effect.gen(function* () {
                      const listener = yield* native(() =>
                        platform.listen(app, {
                          ...listenerOptions,
                          ...(listenerOptions.closeTimeoutMs === undefined &&
                          options.closeTimeoutMs !== undefined
                            ? { closeTimeoutMs: options.closeTimeoutMs }
                            : {}),
                        }),
                      );
                      if (current.closed) {
                        const released = yield* Effect.exit(native(() => listener.close()));
                        if (Exit.isFailure(released)) {
                          const failure = Cause.squash(released.cause);
                          current.startupReleaseFailures.push(failure);
                          return yield* Effect.fail(failure);
                        }
                        return yield* Effect.fail(new Error("Test HTTP client is closed"));
                      }
                      current.listeners.add(listener);
                      return listener;
                    }),
                  ),
                  scope,
                  // Native listen has no signal; retain its real completion for owner release.
                  { uninterruptible: true },
                );
                const receipt = runOwnedContext(context, Fiber.join(fiber));
                current.pending.add(receipt);
                void receipt.finally(() => current.pending.delete(receipt)).catch(() => undefined);
                return yield* restore(Fiber.join(fiber));
              }),
            ),
        );
        return TestHttpOwner.of({ listen, close });
      }),
      (service) => service.close.pipe(Effect.orDie),
    ),
  );
}
