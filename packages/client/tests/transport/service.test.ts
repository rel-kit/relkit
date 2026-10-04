import { expect, it } from "@effect/vitest";
import { Context, Deferred, Effect, Exit, Fiber, Layer, Logger, Metric, Stream } from "effect";
import { acquireClientOwner } from "../../src/client-owner.js";
import { nativeStream } from "../../src/native-stream.js";
import { ClientTransport, clientTransportLayer } from "../../src/transport.service.js";

it.effect("owner closure interrupts and joins an unfinished shared selection", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>();
    let released = false;
    const layer = clientTransportLayer(
      Deferred.succeed(started, undefined).pipe(
        Effect.andThen(Effect.never),
        Effect.ensuring(
          Effect.sync(() => {
            released = true;
          }),
        ),
      ),
    );
    const owner = yield* Effect.acquireRelease(
      Effect.sync(() => acquireClientOwner(layer, ClientTransport)),
      (owner) => Effect.promise(() => owner.close()),
    );
    const invocation = yield* Effect.forkChild(
      owner.service.invoke([], undefined, { context: {} }),
    );
    yield* Deferred.await(started);
    yield* Effect.promise(() => owner.close());
    expect(released).toBe(true);
    expect(Exit.isFailure(yield* Fiber.await(invocation))).toBe(true);
  }).pipe(Effect.scoped),
);

it.effect("caller interruption cannot cancel or poison shared owner selection", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>();
    const ready = yield* Deferred.make<void>();
    let selections = 0;
    let interrupted = false;
    const layer = clientTransportLayer(
      Effect.gen(function* () {
        selections++;
        yield* Deferred.succeed(started, undefined);
        yield* Deferred.await(ready);
        return { call: async () => "connected" };
      }).pipe(
        Effect.onExit((exit) =>
          Effect.sync(() => {
            interrupted = Exit.isFailure(exit);
          }),
        ),
      ),
    );
    const owner = yield* Effect.acquireRelease(
      Effect.sync(() => acquireClientOwner(layer, ClientTransport)),
      (owner) => Effect.promise(() => owner.close()),
    );
    const first = yield* Effect.forkChild(owner.service.invoke([], undefined, { context: {} }));
    yield* Deferred.await(started);
    const sibling = yield* Effect.forkChild(owner.service.invoke([], undefined, { context: {} }));
    yield* Fiber.interrupt(first);
    expect(interrupted).toBe(false);
    yield* Deferred.succeed(ready, undefined);
    expect(yield* Fiber.join(sibling)).toBe("connected");
    expect(yield* owner.service.invoke([], undefined, { context: {} })).toBe("connected");
    expect(selections).toBe(1);
    expect(interrupted).toBe(false);
  }).pipe(Effect.scoped),
);

it.effect("selects a live link once and preserves original transport rejection identity", () =>
  Effect.gen(function* () {
    let selections = 0;
    let calls = 0;
    const rejection = { code: "DECLARED_FAILURE", sensitive: "private-input" };
    const registry: Metric.MetricRegistry = new Map();
    const live = clientTransportLayer(
      Effect.sync(() => {
        selections++;
        return {
          call: async () => {
            if (++calls === 3) throw rejection;
            return calls;
          },
        };
      }),
    );
    const owner = yield* Effect.acquireRelease(
      Effect.sync(() => acquireClientOwner(live, ClientTransport)),
      (owner) => Effect.promise(() => owner.close()),
    );
    expect(selections).toBe(0);
    expect(
      yield* Effect.promise(() =>
        owner.run(owner.service.invoke(["declared"], {}, { context: {} })),
      ),
    ).toBe(1);
    expect(
      yield* Effect.promise(() =>
        owner.run(owner.service.invoke(["declared"], {}, { context: {} })),
      ),
    ).toBe(2);
    yield* Effect.promise(() =>
      expect(owner.run(owner.service.invoke(["declared"], {}, { context: {} }))).rejects.toBe(
        rejection,
      ),
    );
    expect(selections).toBe(1);
    // A service substituted with the same contract needs no native transport.
    const test = Layer.succeed(
      ClientTransport,
      ClientTransport.of({
        invoke: Effect.fn("ClientTransport.testInvoke")(() => Effect.succeed("test-layer")),
      }),
    );
    expect(
      yield* Effect.flatMap(ClientTransport, (service) =>
        service.invoke([], undefined, { context: {} }),
      ).pipe(Effect.provide(test)),
    ).toBe("test-layer");
    yield* owner.service
      .invoke([], rejection, { context: {} })
      .pipe(
        Effect.provideService(Metric.MetricRegistry, registry),
        Effect.provide(Logger.layer([])),
      );
    const operations = [...registry.values()].filter(
      (entry) => entry.id === "relkit_execution_operations_total",
    );
    expect(operations).toHaveLength(1);
    expect(operations[0]?.attributes).toMatchObject({ domain: "client", operation: "rpc.invoke" });
    expect(JSON.stringify(operations.map((entry) => entry.attributes))).not.toContain(
      "private-input",
    );
    expect(operations[0]?.hooks.get(Context.empty()).count).toBe(1);
  }).pipe(Effect.scoped),
);

it.effect("return and throw interrupt pending native pulls and release exactly once", () =>
  Effect.promise(async () => {
    for (const throwing of [false, true]) {
      const caller = new AbortController();
      let request: AbortSignal | undefined;
      let releases = 0;
      const started = Promise.withResolvers<void>();
      const source = nativeStream(
        "test.native.fixed",
        async (signal) => {
          request = signal;
          return {
            next: () =>
              new Promise<IteratorResult<number>>((_resolve, reject) => {
                signal.addEventListener("abort", () => reject(signal.reason), { once: true });
                started.resolve();
              }),
            return: async () => {
              releases++;
              return { done: true as const, value: undefined };
            },
          };
        },
        caller.signal,
      );
      const iterator = Stream.toAsyncIterable(source)[Symbol.asyncIterator]();
      const pending = iterator.next().catch(() => undefined);
      try {
        await started.promise;
        if (throwing) {
          const cause = { message: "original iterator throw" };
          await expect(iterator.throw!(cause)).rejects.toBe(cause);
        } else await iterator.return!();
        await pending;
        expect(request?.aborted).toBe(true);
        expect(caller.signal.aborted).toBe(false);
        expect(releases).toBe(1);
      } finally {
        await iterator.return!();
      }
      expect(releases).toBe(1);
    }
  }),
);

it.effect("return interrupts pending acquisition and closes a late acquired iterator", () =>
  Effect.promise(async () => {
    const opened = Promise.withResolvers<AsyncIterator<number>>();
    const started = Promise.withResolvers<void>();
    let signal: AbortSignal | undefined;
    let released = 0;
    const iterator = Stream.toAsyncIterable(
      nativeStream("test.acquire.fixed", (owned) => {
        signal = owned;
        started.resolve();
        return opened.promise;
      }),
    )[Symbol.asyncIterator]();
    const pending = iterator.next().catch(() => undefined);
    try {
      await started.promise;
      await iterator.return!();
      expect(signal?.aborted).toBe(true);
      opened.resolve({
        next: async () => ({ done: true, value: undefined }),
        return: async () => {
          released++;
          return { done: true, value: undefined };
        },
      });
      await pending;
      await opened.promise;
      await Promise.resolve();
      expect(released).toBe(1);
    } finally {
      opened.resolve({ next: async () => ({ done: true, value: undefined }) });
      await iterator.return!();
    }
  }),
);
