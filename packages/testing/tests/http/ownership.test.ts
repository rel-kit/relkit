import { expect, it } from "@effect/vitest";
import { Cause, Deferred, Effect, Exit, Fiber, Layer } from "effect";
import type { TestHttpListener } from "../../src/http-listener.js";
import { TestHttpOwner, TestHttpPlatform, httpOwnerLayer } from "../../src/http-owner.js";

it.effect("retains real listener startup after its caller stops waiting", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    const order: string[] = [];
    const platform = Layer.succeed(
      TestHttpPlatform,
      TestHttpPlatform.of({
        listen: async () => {
          await Effect.runPromise(Deferred.succeed(started, undefined));
          await Effect.runPromise(Deferred.await(release));
          return {
            purpose: "disconnect",
            url: new URL("http://127.0.0.1:1"),
            get server(): Bun.Server<undefined> {
              throw new Error("This fixture retains a native startup receipt only");
            },
            request: async () => new Response(),
            close: async () => {
              order.push("listener");
            },
          };
        },
      }),
    );
    yield* Effect.gen(function* () {
      const owner = yield* TestHttpOwner;
      const opening = yield* Effect.forkChild(owner.listen());
      try {
        yield* Deferred.await(started);
        yield* Fiber.interrupt(opening);
        const closing = yield* Effect.forkChild(owner.close);
        yield* Effect.yieldNow;
        expect(order).toEqual([]);
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(closing);
      } finally {
        yield* Deferred.succeed(release, undefined);
      }
    }).pipe(
      Effect.provide(
        httpOwnerLayer(
          { fetch: () => new Response() },
          {
            onClose: () => {
              order.push("owner");
            },
          },
        ).pipe(Layer.provide(platform)),
      ),
    );
    expect(order).toEqual(["listener", "owner"]);
  }),
);

it.effect(
  "joins listener startup races and releases every listener before the owner callback",
  () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const order: string[] = [];
      const listener: TestHttpListener = {
        purpose: "disconnect",
        url: new URL("http://127.0.0.1:1"),
        get server(): Bun.Server<undefined> {
          throw new Error("This platform fixture never supplies a native server");
        },
        request: async () => new Response(),
        close: async () => {
          order.push("listener");
        },
      };
      const platform = Layer.succeed(
        TestHttpPlatform,
        TestHttpPlatform.of({
          listen: async () => {
            await Effect.runPromise(Deferred.succeed(started, undefined));
            await Effect.runPromise(Deferred.await(release));
            return listener;
          },
        }),
      );
      yield* Effect.gen(function* () {
        const owner = yield* TestHttpOwner;
        const opening = yield* Effect.forkChild(owner.listen());
        try {
          yield* Deferred.await(started);
          const closing = yield* Effect.forkChild(owner.close);
          yield* Effect.yieldNow;
          yield* Deferred.succeed(release, undefined);
          const rejected = yield* Effect.exit(Fiber.join(opening));
          expect(Exit.isFailure(rejected)).toBe(true);
          if (Exit.isFailure(rejected))
            expect(String(Cause.squash(rejected.cause))).toContain("closed");
          yield* Fiber.join(closing);
        } finally {
          yield* Deferred.succeed(release, undefined);
        }
      }).pipe(
        Effect.provide(
          httpOwnerLayer(
            { fetch: () => new Response() },
            {
              onClose: () => {
                order.push("owner");
              },
            },
          ).pipe(Layer.provide(platform)),
        ),
      );
      expect(order).toEqual(["listener", "owner"]);
    }),
);

it.effect("attempts sibling listener release and owner callback after native close failure", () =>
  Effect.gen(function* () {
    const sentinel = new Error("listener close");
    const order: string[] = [];
    let next = 0;
    const platform = Layer.succeed(
      TestHttpPlatform,
      TestHttpPlatform.of({
        listen: async () => {
          const id = ++next;
          return {
            purpose: "disconnect",
            url: new URL("http://127.0.0.1:1"),
            get server(): Bun.Server<undefined> {
              throw new Error("This fixture tests the platform release contract");
            },
            request: async () => new Response(),
            close: async () => {
              order.push(String(id));
              if (id === 1) throw sentinel;
            },
          };
        },
      }),
    );
    const result = yield* Effect.exit(
      Effect.gen(function* () {
        const owner = yield* TestHttpOwner;
        yield* owner.listen();
        yield* owner.listen();
        yield* owner.close;
      }).pipe(
        Effect.provide(
          httpOwnerLayer(
            { fetch: () => new Response() },
            {
              onClose: () => {
                order.push("owner");
              },
            },
          ).pipe(Layer.provide(platform)),
        ),
      ),
    );
    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) expect(Cause.squash(result.cause)).toBe(sentinel);
    expect(order).toEqual(["1", "2", "owner"]);
  }),
);
