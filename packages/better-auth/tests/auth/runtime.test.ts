import { expect, it } from "@effect/vitest";
import { Cause, Deferred, Effect, Exit, Fiber, Layer, ManagedRuntime } from "effect";
import { authNativeAdapter, runAuthPromise } from "../../src/activation.js";
import { AuthFailure } from "../../src/auth.errors.js";
import { AuthService, authNativeOf } from "../../src/auth.service.js";
import { authTestDatabase, authTestLayer, nativeAuthStub } from "./auth-test-layer.js";

it.effect("substitutes the factory and preserves native method properties and API admission", () =>
  Effect.gen(function* () {
    const database = yield* authTestDatabase();
    let calls = 0;
    const native = nativeAuthStub({
      session: async () => {
        calls++;
        return { session: "test" };
      },
    });
    const owner = yield* Effect.acquireRelease(
      Effect.sync(() =>
        ManagedRuntime.make(
          authTestLayer({ database, options: {}, basePath: "/api/auth" }, Effect.succeed(native)),
        ),
      ),
      (runtime) => Effect.promise(() => runtime.dispose()),
    );
    const service = yield* Effect.promise(() => owner.runPromise(AuthService));
    const auth = authNativeAdapter(owner, authNativeOf(service));
    expect(authNativeAdapter(owner, authNativeOf(service))).toBe(auth);
    expect(auth.options).toBe(native.options);
    expect(auth.$context).toBe(native.$context);
    expect(auth.fetch).toBe(auth.handler);
    expect(auth.api.getSession).toBe(auth.api.getSession);
    expect(Reflect.get(auth.api.getSession, "path")).toBe("/get-session");
    expect(yield* Effect.promise(() => auth.api.getSession({ headers: new Headers() }))).toEqual({
      session: "test",
    });
    yield* Effect.promise(() =>
      Promise.resolve(Reflect.apply(Reflect.get(auth.api, "extraEndpoint"), auth.api, [])),
    );
    expect(calls).toBe(2);
    yield* Effect.promise(() => database.close());
    const closed = yield* Effect.promise(() =>
      Promise.allSettled([
        auth.handler(new Request("http://localhost/api/auth/get-session")),
        auth.fetch(new Request("http://localhost/api/auth/get-session")),
        auth.api.getSession({ headers: new Headers() }),
        Reflect.apply(Reflect.get(auth.api, "extraEndpoint"), auth.api, []),
      ]),
    );
    expect(closed.every((result) => result.status === "rejected")).toBe(true);
    expect(calls).toBe(2);
  }).pipe(Effect.scoped),
);

it.effect("keeps eager SDK context initialization admitted until native completion", () =>
  Effect.gen(function* () {
    const events: string[] = [];
    const database = yield* authTestDatabase(() => {
      events.push("dispose");
    });
    const started = yield* Deferred.make<void>();
    const finish = yield* Deferred.make<void>();
    const context = Effect.runPromise(Deferred.await(finish)).then(() => {
      events.push("initialized");
      return {};
    });
    const native = nativeAuthStub({ context });
    const outcome = Effect.gen(function* () {
      yield* Deferred.succeed(started, undefined);
      return native;
    });
    const owner = yield* Effect.acquireRelease(
      Effect.sync(() =>
        ManagedRuntime.make(
          authTestLayer({ database, options: {}, basePath: "/api/auth" }, outcome),
        ),
      ),
      (runtime) => Effect.promise(() => runtime.dispose()),
    );
    const acquisition = owner.runPromise(AuthService);
    yield* Deferred.await(started);
    const closing = database.close();
    expect(events).toEqual([]);
    yield* Deferred.succeed(finish, undefined);
    yield* Effect.promise(() => acquisition);
    yield* Effect.promise(() => closing);
    expect(events).toEqual(["initialized", "dispose"]);
  }).pipe(Effect.scoped),
);

it.effect("interruption waits for uncancellable native handler before DB release", () =>
  Effect.gen(function* () {
    const events: string[] = [];
    const database = yield* authTestDatabase(() => {
      events.push("dispose");
    });
    const started = yield* Deferred.make<void>();
    const finish = yield* Deferred.make<void>();
    const caller = new AbortController();
    let received: Request | undefined;
    const native = nativeAuthStub({
      handler: (request) => {
        received = request;
        Effect.runSync(Deferred.succeed(started, undefined));
        return Effect.runPromise(Deferred.await(finish)).then(() => {
          events.push("native finished");
          return new Response("ok");
        });
      },
    });
    const owner = yield* Effect.acquireRelease(
      Effect.sync(() =>
        ManagedRuntime.make(
          authTestLayer({ database, options: {}, basePath: "/api/auth" }, Effect.succeed(native)),
        ),
      ),
      (runtime) => Effect.promise(() => runtime.dispose()),
    );
    yield* Effect.promise(() => owner.runPromise(AuthService));
    const request = new Request("http://localhost/api/auth/get-session", { signal: caller.signal });
    // Request wraps the signal; forwarding preserves the Request object's own signal.
    const operation = Effect.flatMap(AuthService, (service) => service.handler(request));
    const fiber = owner.runFork(operation);
    yield* Deferred.await(started);
    expect(received).toBe(request);
    caller.abort();
    expect(received?.signal.aborted).toBe(true);
    const closing = database.close();
    // Request interruption synchronously; joining is deferred until the native gate settles.
    yield* Effect.sync(() => fiber.interruptUnsafe());
    expect(events).toEqual([]);
    yield* Deferred.succeed(finish, undefined);
    const exit = yield* Fiber.await(fiber);
    expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBe(true);
    yield* Effect.promise(() => closing);
    expect(events).toEqual(["native finished", "dispose"]);
  }).pipe(Effect.scoped),
);

it.effect(
  "preserves SDK failures, acquisition failures, defects and interruption at Promise edges",
  () =>
    Effect.gen(function* () {
      const owner = yield* Effect.acquireRelease(
        Effect.sync(() => ManagedRuntime.make(Layer.empty)),
        (runtime) => Effect.promise(() => runtime.dispose()),
      );
      const native = new TypeError("native rejection");
      yield* Effect.promise(async () => {
        await expect(
          runAuthPromise(
            owner,
            Effect.fail(new AuthFailure({ operation: "auth.session", cause: native })),
          ),
        ).rejects.toBe(native);
        await expect(runAuthPromise(owner, Effect.die(native))).rejects.toBe(native);
      });
      const failed = yield* Effect.acquireRelease(
        Effect.sync(() =>
          ManagedRuntime.make(
            Layer.effect(
              AuthService,
              Effect.fail(new AuthFailure({ operation: "auth.acquire", cause: native })),
            ),
          ),
        ),
        (runtime) => Effect.promise(() => runtime.dispose()),
      );
      yield* Effect.promise(() => expect(runAuthPromise(failed, AuthService)).rejects.toBe(native));
    }).pipe(Effect.scoped),
);
