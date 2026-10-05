import { expect, it } from "@effect/vitest";
import { Deferred, Effect, ManagedRuntime } from "effect";
import { activateBetterAuthService, defineBetterAuthService } from "../../src/index.js";
import { authNativeAdapter } from "../../src/activation.js";
import { AuthService, authNativeOf } from "../../src/auth.service.js";
import { authTestLayer, nativeAuthStub } from "./auth-test-layer.js";
import { coordinatedDatabase } from "./coordination-fixture.js";

it.effect(
  "native eager initializer can await public portable models under its existing SQLite lease",
  () =>
    Effect.gen(function* () {
      const fixture = yield* coordinatedDatabase();
      let initialized = false;
      const descriptor = defineBetterAuthService({
        baseURL: "http://localhost",
        plugins: [
          {
            id: "portable-hook",
            async init() {
              expect(await fixture.database.context.user.findOne({ where: { id: 1 } })).toEqual({
                id: 1,
              });
              initialized = true;
            },
          },
        ],
      });
      yield* Effect.promise(() =>
        activateBetterAuthService(descriptor, fixture.database, "/api/auth", { isolated: true }),
      );
      expect(initialized).toBe(true);
      expect(fixture.events).toEqual(["portable"]);
    }).pipe(Effect.scoped),
);

it.effect(
  "a delayed SDK descendant reacquires its expired permit before using a public model",
  () =>
    Effect.gen(function* () {
      const fixture = yield* coordinatedDatabase();
      const descendantReady = yield* Deferred.make<void>();
      const launch = yield* Deferred.make<void>();
      let descendant: Promise<unknown> | undefined;
      const native = nativeAuthStub({
        handler: async () => {
          descendant = Effect.runPromise(Deferred.await(launch)).then(async () => {
            Effect.runSync(Deferred.succeed(descendantReady, undefined));
            return fixture.database.context.user.findOne({ where: { id: 1 } });
          });
          return new Response("ok");
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
      yield* Effect.promise(() =>
        owner.runPromise(service.handler(new Request("http://localhost/api/auth/get-session"))),
      );
      const entered = yield* Deferred.make<void>();
      const finish = yield* Deferred.make<void>();
      const transaction = fixture.database.context.transaction(async () => {
        Effect.runSync(Deferred.succeed(entered, undefined));
        await Effect.runPromise(Deferred.await(finish));
      });
      yield* Deferred.await(entered);
      yield* Deferred.succeed(launch, undefined);
      yield* Deferred.await(descendantReady);
      yield* Effect.promise(() => Promise.resolve());
      const beforeCommit = [...fixture.events];
      yield* Deferred.succeed(finish, undefined);
      yield* Effect.promise(() => transaction);
      const result = yield* Effect.promise(
        () => descendant ?? Promise.reject(new Error("Expected SDK descendant")),
      );
      expect(result).toEqual({ id: 1 });
      expect(beforeCommit).toEqual(["begin"]);
      expect(fixture.events).toEqual(["begin", "commit", "portable"]);
      expect(fixture.sawUnrelatedTransaction()).toBe(false);
    }).pipe(Effect.scoped),
);

it.effect(
  "native eager initialization waits for another SQLite transaction before issuing queries",
  () =>
    Effect.gen(function* () {
      const fixture = yield* coordinatedDatabase();
      const entered = yield* Deferred.make<void>();
      const finish = yield* Deferred.make<void>();
      const transaction = fixture.database.context.transaction(async () => {
        Effect.runSync(Deferred.succeed(entered, undefined));
        await Effect.runPromise(Deferred.await(finish));
      });
      yield* Deferred.await(entered);
      const descriptor = defineBetterAuthService({
        baseURL: "http://localhost",
        plugins: [
          {
            id: "native-query",
            init() {
              fixture.read("native initialization");
            },
          },
        ],
      });
      const acquisition = activateBetterAuthService(descriptor, fixture.database, "/api/auth", {
        isolated: true,
      });
      yield* Effect.yieldNow;
      yield* Effect.promise(() => Promise.resolve());
      const beforeCommit = [...fixture.events];
      yield* Deferred.succeed(finish, undefined);
      yield* Effect.promise(() => transaction);
      yield* Effect.promise(() => acquisition);
      expect(beforeCommit).toEqual(["begin"]);
      expect(fixture.events).toEqual(["begin", "commit", "native initialization"]);
      expect(fixture.sawUnrelatedTransaction()).toBe(false);
    }).pipe(Effect.scoped),
);

it.effect(
  "failed eager initialization releases the native lease and leaves borrowed portable work usable",
  () =>
    Effect.gen(function* () {
      const fixture = yield* coordinatedDatabase();
      const failure = new Error("eager initialization failed");
      const descriptor = defineBetterAuthService({
        baseURL: "http://localhost",
        plugins: [
          {
            id: "failing-hook",
            async init() {
              await fixture.database.context.user.findOne({ where: { id: 1 } });
              throw failure;
            },
          },
        ],
      });
      const caught = yield* Effect.promise(() =>
        activateBetterAuthService(descriptor, fixture.database, "/api/auth", {
          isolated: true,
        }).then(
          () => undefined,
          (error: unknown) => error,
        ),
      );
      expect(caught).toBe(failure);
      expect(
        yield* Effect.promise(() => fixture.database.context.user.findOne({ where: { id: 1 } })),
      ).toEqual({ id: 1 });
      expect(fixture.events).toEqual(["portable", "portable"]);
    }).pipe(Effect.scoped),
);

it.effect(
  "an admitted native hook can recursively await the public Auth API after DB close begins",
  () =>
    Effect.gen(function* () {
      const fixture = yield* coordinatedDatabase();
      const entered = yield* Deferred.make<void>();
      const finish = yield* Deferred.make<void>();
      let nested: () => Promise<unknown> = () => Promise.reject(new Error("Auth not initialized"));
      const native = nativeAuthStub({
        handler: async () => {
          Effect.runSync(Deferred.succeed(entered, undefined));
          await Effect.runPromise(Deferred.await(finish));
          expect(await nested()).toEqual({ id: 1 });
          return new Response("ok");
        },
        session: async () => fixture.read("nested session"),
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
      const adapter = authNativeAdapter(owner, authNativeOf(service));
      nested = () => adapter.api.getSession({ headers: new Headers() });
      const response = adapter.handler(new Request("http://localhost/api/auth/get-session"));
      yield* Deferred.await(entered);
      const closing = fixture.database.close();
      yield* Deferred.succeed(finish, undefined);
      expect((yield* Effect.promise(() => response)).status).toBe(200);
      yield* Effect.promise(() => closing);
      expect(fixture.events).toEqual(["nested session"]);
    }).pipe(Effect.scoped),
);
