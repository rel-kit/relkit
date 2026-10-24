/**
 * Exercises single-flight initialization with injected loader Layers and explicit
 * Deferred synchronization. Tests own every fiber and Scope and verify that
 * waiter cancellation and generation retirement join the same physical import.
 */
import { Context, Deferred, Effect, Exit, Fiber, Layer, Ref, Scope } from "effect";
import { expect, test } from "vitest";
import { Hono } from "hono";
import { PreparedTransports, PreparedTransportLoader } from "../src/prepared-transports.service.js";
import { preparedOptions } from "./prepared-fixture.js";

const RequestMarker = Context.Reference<string>("PreparedTest.RequestMarker", {
  defaultValue: () => "generation",
});

test("single_flight_context_isolation_does_not_capture_first_request_services", async () => {
  const seen: string[] = [];
  const loader = Layer.succeed(PreparedTransportLoader, {
    load: () =>
      Effect.gen(function* () {
        seen.push(yield* RequestMarker);
        return new Hono();
      }),
  });
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const service = yield* PreparedTransports.make(preparedOptions()).pipe(
          Effect.provide(loader),
        );
        const first = yield* service
          .load()
          .pipe(Effect.provideService(RequestMarker, "request-one"));
        const second = yield* service
          .load()
          .pipe(Effect.provideService(RequestMarker, "request-two"));
        expect(first).toBe(second);
        expect(seen).toEqual(["generation"]);
      }),
    ),
  );
});

test("concurrent waiters share initialization and retain separate native requests", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const calls = yield* Ref.make(0);
        const loader = Layer.succeed(PreparedTransportLoader, {
          load: () =>
            Effect.gen(function* () {
              yield* Ref.update(calls, (count) => count + 1);
              yield* Deferred.succeed(entered, undefined);
              yield* Deferred.await(release);
              const app = new Hono();
              app.get("/rpc", (context) =>
                context.text(context.req.header("x-request-id") ?? "absent"),
              );
              return app;
            }),
        });
        const service = yield* PreparedTransports.make(preparedOptions()).pipe(
          Effect.provide(loader),
        );
        const first = yield* Effect.forkScoped(service.load());
        yield* Deferred.await(entered);
        const second = yield* Effect.forkScoped(service.load());
        yield* Deferred.succeed(release, undefined);
        const applications = yield* Effect.all([Fiber.join(first), Fiber.join(second)]);
        expect(applications[0]).toBe(applications[1]);
        expect(yield* Ref.get(calls)).toBe(1);
        const bodies = yield* Effect.promise(() =>
          Promise.all(
            applications.map((app, index) =>
              Promise.resolve(
                app.request("http://localhost/rpc", {
                  headers: { "x-request-id": `request-${index}` },
                }),
              ).then((response) => response.text()),
            ),
          ),
        );
        expect(bodies).toEqual(["request-0", "request-1"]);
      }),
    ),
  );
});

test("cancelled first waiter cannot abandon loading and retirement joins native completion", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const completed = yield* Ref.make(false);
        const scope = yield* Scope.make();
        const loader = Layer.succeed(PreparedTransportLoader, {
          load: () =>
            Effect.gen(function* () {
              yield* Deferred.succeed(entered, undefined);
              yield* Deferred.await(release);
              yield* Ref.set(completed, true);
              return new Hono();
            }),
        });
        const service = yield* PreparedTransports.make(preparedOptions()).pipe(
          Effect.provide(loader),
          Effect.provideService(Scope.Scope, scope),
        );
        const first = yield* Effect.forkScoped(service.load());
        yield* Deferred.await(entered);
        yield* Fiber.interrupt(first);
        const closing = yield* Effect.forkScoped(Scope.close(scope, Exit.void));
        expect(yield* Ref.get(completed)).toBe(false);
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(closing);
        expect(yield* Ref.get(completed)).toBe(true);
      }),
    ),
  );
});
