import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Exit, Fiber, Layer, Ref } from "effect";
import { CliAdapterError } from "../../src/cli-errors.js";
import {
  CliModules,
  makeSessionModuleLayer,
  moduleLayer,
} from "../../src/services/modules.service.js";

it.effect("one interrupted waiter does not cancel another namespace consumer", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    const calls = yield* Ref.make(0);
    const namespace = { default: "loaded" };
    const layer = makeSessionModuleLayer(() =>
      Effect.gen(function* () {
        yield* Ref.update(calls, (count) => count + 1);
        yield* Deferred.succeed(entered, undefined);
        yield* Deferred.await(release);
        return namespace;
      }),
    );
    yield* Effect.gen(function* () {
      const modules = yield* CliModules;
      const first = yield* modules.load("module?epoch=1").pipe(Effect.forkChild);
      yield* Deferred.await(entered);
      const second = yield* modules.load("module?epoch=1").pipe(Effect.forkChild);
      yield* Effect.yieldNow;
      yield* Fiber.interrupt(first);
      yield* Deferred.succeed(release, undefined);
      expect(yield* Fiber.join(second)).toBe(namespace);
      expect(yield* modules.load("module?epoch=1")).toBe(namespace);
      expect(yield* Ref.get(calls)).toBe(1);
    }).pipe(Effect.provide(layer));
  }),
);

it.effect("failed imports are retried and successful entries invalidate only in this session", () =>
  Effect.gen(function* () {
    const calls = yield* Ref.make(0);
    const layer = makeSessionModuleLayer((specifier) =>
      Effect.gen(function* () {
        const attempt = yield* Ref.updateAndGet(calls, (count) => count + 1);
        if (attempt === 1)
          return yield* Effect.fail(
            new CliAdapterError({
              operation: "modules.load",
              message: "transient",
              cause: new Error("transient"),
            }),
          );
        return { specifier, attempt };
      }),
    );
    yield* Effect.gen(function* () {
      const modules = yield* CliModules;
      expect(Exit.isFailure(yield* Effect.exit(modules.load("config?epoch=1")))).toBe(true);
      expect((yield* modules.load("config?epoch=1")).attempt).toBe(2);
      expect((yield* modules.load("config?epoch=1")).attempt).toBe(2);
      yield* modules.invalidate();
      expect((yield* modules.load("config?epoch=1")).attempt).toBe(3);
      expect((yield* modules.load("config?epoch=2")).attempt).toBe(4);
    }).pipe(Effect.provide(layer));
    yield* Effect.gen(function* () {
      const modules = yield* CliModules;
      expect((yield* modules.load("config?epoch=1")).attempt).toBe(5);
    }).pipe(Effect.provide(layer));
  }),
);

it.effect("last-consumer interruption abandons the lookup and permits recovery", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    const calls = yield* Ref.make(0);
    const layer = makeSessionModuleLayer(() =>
      Effect.gen(function* () {
        const attempt = yield* Ref.updateAndGet(calls, (count) => count + 1);
        if (attempt === 1) {
          yield* Deferred.succeed(entered, undefined);
          return yield* Effect.never;
        }
        return { attempt };
      }),
    );
    yield* Effect.gen(function* () {
      const modules = yield* CliModules;
      const abandoned = yield* modules
        .load("recipe?epoch=1")
        .pipe(Effect.forkChild({ startImmediately: true }));
      yield* Deferred.await(entered);
      yield* Effect.yieldNow;
      yield* Fiber.interrupt(abandoned);
      expect((yield* modules.load("recipe?epoch=1")).attempt).toBe(2);
    }).pipe(Effect.provide(layer));
  }),
);

it.live("validation retains native namespace identity and live bindings", () =>
  Effect.gen(function* () {
    const modules = yield* CliModules;
    const url = `data:text/javascript,export let count=0;export function bump(){count++} //${crypto.randomUUID()}`;
    const namespace = yield* modules.load(url);
    const again = yield* modules.load(url);
    expect(namespace).toBe(again);
    expect(namespace.count).toBe(0);
    if (typeof namespace.bump !== "function") throw new Error("Missing fixture export.");
    namespace.bump();
    expect(namespace.count).toBe(1);
  }).pipe(Effect.provide(moduleLayer)),
);

it.effect("an old pending lookup cannot replace a newer value after invalidation", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    const attempts = yield* Ref.make(0);
    const layer = makeSessionModuleLayer(() =>
      Effect.gen(function* () {
        const attempt = yield* Ref.updateAndGet(attempts, (value) => value + 1);
        if (attempt === 1) {
          yield* Deferred.succeed(entered, undefined);
          yield* Deferred.await(release);
        }
        return { attempt };
      }),
    );
    yield* Effect.gen(function* () {
      const modules = yield* CliModules;
      const old = yield* modules.load("config?epoch=1").pipe(Effect.forkChild);
      yield* Deferred.await(entered);
      yield* modules.invalidate();
      const current = yield* modules.load("config?epoch=1");
      expect(current.attempt).toBe(2);
      yield* Deferred.succeed(release, undefined);
      yield* Fiber.await(old);
      expect(yield* modules.load("config?epoch=1")).toBe(current);
      expect(yield* Ref.get(attempts)).toBe(2);
    }).pipe(Effect.provide(layer));
  }),
);
