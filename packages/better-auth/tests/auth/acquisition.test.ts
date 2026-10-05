import { expect, it } from "@effect/vitest";
import { activateDrizzleService, defineDrizzleService } from "@relkit/drizzle";
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { Cause, Deferred, Effect, Exit, ManagedRuntime } from "effect";
import { activateBetterAuthService, defineBetterAuthService } from "../../src/index.js";
import { AuthService, authNativeOf } from "../../src/auth.service.js";
import { authTestLayer, nativeAuthStub } from "./auth-test-layer.js";

const user = sqliteTable("user", { id: integer().primaryKey() });

it.effect(
  "evicts failing shared native initialization and retries without disposing the borrowed DB",
  () =>
    Effect.gen(function* () {
      let releases = 0;
      let attempts = 0;
      const initialized = yield* Deferred.make<void>();
      const finish = yield* Deferred.make<void>();
      const failure = new TypeError("native plugin initialization failed");
      const declaration = defineDrizzleService({
        schema: { user },
        client: () => ({}),
        dispose: () => {
          releases++;
        },
      });
      const database = yield* Effect.acquireRelease(
        Effect.promise(() => activateDrizzleService(declaration, {}, { isolated: true })),
        (active) => Effect.promise(() => active.close()),
      );
      const descriptor = defineBetterAuthService({
        baseURL: "http://localhost",
        plugins: [
          {
            id: "controlled-test-init",
            async init() {
              attempts++;
              if (attempts === 1) {
                Effect.runSync(Deferred.succeed(initialized, undefined));
                await Effect.runPromise(Deferred.await(finish));
                throw failure;
              }
            },
          },
        ],
      });
      const first = activateBetterAuthService(descriptor, database, "/api/auth");
      const second = activateBetterAuthService(descriptor, database, "/api/auth");
      const outcomes = Promise.allSettled([first, second]);
      yield* Deferred.await(initialized);
      expect(attempts).toBe(1);
      yield* Deferred.succeed(finish, undefined);
      const results = yield* Effect.promise(() => outcomes);
      expect(
        results.every((result) => result.status === "rejected" && result.reason === failure),
      ).toBe(true);
      const recovered = yield* Effect.promise(() =>
        activateBetterAuthService(descriptor, database, "/api/auth"),
      );
      expect(attempts).toBe(2);
      expect(
        yield* Effect.promise(() => activateBetterAuthService(descriptor, database, "/ignored")),
      ).toBe(recovered);
      expect(recovered.options.basePath).toBe("/api/auth");
      expect(releases).toBe(0);
      expect(Object.isFrozen(descriptor)).toBe(true);
      expect(Object.isFrozen(descriptor.handler)).toBe(true);
      yield* Effect.promise(() => database.close());
      expect(releases).toBe(1);
      expect(
        yield* Effect.promise(() => activateBetterAuthService(descriptor, database, "/ignored")),
      ).toBe(recovered);
    }).pipe(Effect.scoped),
);

it.effect("cancelling one acquisition waiter does not cancel the managed Layer for another", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>();
    const finish = yield* Deferred.make<void>();
    const declaration = defineDrizzleService({ schema: { user }, client: () => ({}) });
    const database = yield* Effect.acquireRelease(
      Effect.promise(() => activateDrizzleService(declaration, {}, { isolated: true })),
      (active) => Effect.promise(() => active.close()),
    );
    const native = nativeAuthStub();
    let acquisitions = 0;
    const factory = Effect.gen(function* () {
      acquisitions++;
      yield* Deferred.succeed(started, undefined);
      yield* Deferred.await(finish);
      return native;
    });
    const owner = yield* Effect.acquireRelease(
      Effect.sync(() =>
        ManagedRuntime.make(
          authTestLayer({ database, options: {}, basePath: "/api/auth" }, factory),
        ),
      ),
      (runtime) => Effect.promise(() => runtime.dispose()),
    );
    const cancelled = new AbortController();
    const first = owner.runPromiseExit(AuthService, { signal: cancelled.signal });
    const second = owner.runPromise(AuthService);
    yield* Deferred.await(started);
    cancelled.abort();
    const firstExit = yield* Effect.promise(() => first);
    expect(Exit.isFailure(firstExit) && Cause.hasInterruptsOnly(firstExit.cause)).toBe(true);
    yield* Deferred.succeed(finish, undefined);
    const remaining = yield* Effect.promise(() => second);
    expect(authNativeOf(remaining)).toBe(native);
    expect(acquisitions).toBe(1);
  }).pipe(Effect.scoped),
);

it.effect(
  "rejects invalid route prefixes before SDK construction and permits later valid activation",
  () =>
    Effect.gen(function* () {
      const declaration = defineDrizzleService({ schema: { user }, client: () => ({}) });
      const database = yield* Effect.acquireRelease(
        Effect.promise(() => activateDrizzleService(declaration, {}, { isolated: true })),
        (active) => Effect.promise(() => active.close()),
      );
      let factories = 0;
      const descriptor = defineBetterAuthService({
        baseURL: "http://localhost",
        plugins: [
          {
            id: "count-init",
            init() {
              factories++;
            },
          },
        ],
      });
      yield* Effect.forEach(
        ["", "/", "/auth/", "/auth/*", "/auth/[...all]"],
        (path) =>
          Effect.promise(async () => {
            await expect(activateBetterAuthService(descriptor, database, path)).rejects.toThrow(
              `Invalid Better Auth base path "${path}"`,
            );
          }),
        { concurrency: 1, discard: true },
      );
      expect(factories).toBe(0);
      yield* Effect.promise(() => activateBetterAuthService(descriptor, database, "/api/auth"));
      expect(factories).toBe(1);
    }).pipe(Effect.scoped),
);
