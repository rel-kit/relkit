import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, ManagedRuntime } from "effect";
import { AuthService } from "../../src/auth.service.js";
import { authTestLayer, nativeAuthStub } from "./auth-test-layer.js";
import { coordinatedDatabase } from "./coordination-fixture.js";

it.effect(
  "raw native handler and API queries wait for an unrelated portable SQLite transaction",
  () =>
    Effect.gen(function* () {
      const fixture = yield* coordinatedDatabase();
      const native = nativeAuthStub({
        handler: async () => {
          fixture.read("native handler");
          return new Response("ok");
        },
        session: async () => fixture.read("native API"),
      });
      const owner = yield* Effect.acquireRelease(
        Effect.sync(() =>
          ManagedRuntime.make(
            authTestLayer(
              { database: fixture.database, options: {}, basePath: "/api/auth" },
              Effect.succeed(native),
            ),
          ),
        ),
        (runtime) => Effect.promise(() => runtime.dispose()),
      );
      const service = yield* Effect.promise(() => owner.runPromise(AuthService));
      const entered = yield* Deferred.make<void>();
      const finish = yield* Deferred.make<void>();
      const transaction = fixture.database.context.transaction(async () => {
        Effect.runSync(Deferred.succeed(entered, undefined));
        await Effect.runPromise(Deferred.await(finish));
      });
      yield* Deferred.await(entered);
      const handler = owner.runFork(
        service.handler(new Request("http://localhost/api/auth/get-session")),
      );
      const api = owner.runFork(service.api("getSession", []));
      // Yield to both admitted callers; the fake detects raw queries inside BEGIN/COMMIT.
      yield* Effect.yieldNow;
      yield* Effect.promise(() => Promise.resolve());
      const beforeCommit = [...fixture.events];
      yield* Deferred.succeed(finish, undefined);
      yield* Effect.promise(() => transaction);
      yield* Fiber.join(handler);
      yield* Fiber.join(api);
      expect(beforeCommit).toEqual(["begin"]);
      expect(fixture.sawUnrelatedTransaction()).toBe(false);
      expect(fixture.events).toEqual(["begin", "commit", "native handler", "native API"]);
    }).pipe(Effect.scoped),
);

it.effect("native query failure releases the SQLite permit for subsequent portable work", () =>
  Effect.gen(function* () {
    const fixture = yield* coordinatedDatabase();
    const failure = new TypeError("native SDK query failed");
    const native = nativeAuthStub({
      session: async () => {
        throw failure;
      },
    });
    const owner = yield* Effect.acquireRelease(
      Effect.sync(() =>
        ManagedRuntime.make(
          authTestLayer(
            { database: fixture.database, options: {}, basePath: "/api/auth" },
            Effect.succeed(native),
          ),
        ),
      ),
      (runtime) => Effect.promise(() => runtime.dispose()),
    );
    const service = yield* Effect.promise(() => owner.runPromise(AuthService));
    yield* Effect.exit(service.api("getSession", []));
    const row = yield* Effect.promise(() =>
      fixture.database.context.user.findOne({ where: { id: 1 } }),
    );
    expect(row).toEqual({ id: 1 });
    expect(fixture.events).toEqual(["portable"]);
  }).pipe(Effect.scoped),
);
