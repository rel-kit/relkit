import { expect, it } from "@effect/vitest";
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Metric } from "effect";
import { createLoggerLayer } from "@relkit/runtime-effect/logger";
import { createProxyLayer, SupervisorProxyOwner } from "../../src/proxy-service.js";
import { createSupervisorProxy } from "../../src/proxy.js";
import { mockFetch } from "../fixtures/fetch.ts";
import type { LogRecord } from "@relkit/runtime-effect/logger";

const token = { sourceToken: 1, generationToken: 1 };
const quiet = createLoggerLayer({ human: false, json: false });

it.effect(
  "standalone interception records original failure and success without a forwarding duplicate",
  () =>
    Effect.gen(function* () {
      const registry: Metric.MetricRegistry = new Map();
      const logs: LogRecord[] = [];
      const failure = new Error("password=intercept-secret");
      let calls = 0;
      yield* Effect.gen(function* () {
        const proxy = yield* SupervisorProxyOwner;
        const response = yield* proxy.handle(new Request("http://public.test/one"));
        expect(response.status).toBe(204);
        const exit = yield* Effect.exit(proxy.handle(new Request("http://public.test/two")));
        expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toBe(failure);
      }).pipe(
        Effect.provide(
          Layer.merge(
            createProxyLayer(
              {
                intercept: () =>
                  ++calls === 1
                    ? Promise.resolve(new Response(null, { status: 204 }))
                    : Promise.reject(failure),
              },
              "127.0.0.1",
            ),
            createLoggerLayer({
              human: false,
              json: { write: (record) => logs.push(record) },
            }),
          ),
        ),
        Effect.provideService(Metric.MetricRegistry, registry),
      );
      expect(logs.map((record) => record.fields.outcome)).toEqual(["success", "failure"]);
      expect(JSON.stringify(logs)).not.toContain("intercept-secret");
      expect(
        [...registry.values()]
          .filter((entry) => entry.id === "relkit_execution_outcomes_total")
          .map((entry) => `${entry.attributes?.operation}:${entry.attributes?.outcome}`)
          .sort(),
      ).toEqual(["proxy.intercept:failure", "proxy.intercept:success"]);
    }),
);

it.effect("standalone compare-and-switch records typed validation and keeps admission atomic", () =>
  Effect.gen(function* () {
    const logs: LogRecord[] = [];
    const registry: Metric.MetricRegistry = new Map();
    yield* Effect.gen(function* () {
      const proxy = yield* SupervisorProxyOwner;
      const invalid = yield* Effect.exit(proxy.compareAndSwitch(undefined, { token, port: 0 }));
      expect(
        Exit.isFailure(invalid) &&
          invalid.cause.reasons.some(
            (reason) => reason._tag === "Fail" && reason.error instanceof RangeError,
          ),
      ).toBe(true);
      expect(yield* proxy.target).toBeUndefined();
      expect(yield* proxy.compareAndSwitch(undefined, { token, port: 3001 })).toBe(true);
    }).pipe(
      Effect.provide(
        Layer.merge(
          createProxyLayer({}, "127.0.0.1"),
          createLoggerLayer({
            minimumLevel: "error",
            human: false,
            json: { write: (record) => logs.push(record) },
          }),
        ),
      ),
      Effect.provideService(Metric.MetricRegistry, registry),
    );
    expect(logs).toHaveLength(1);
    expect(
      [...registry.values()]
        .filter(
          (entry) =>
            entry.id === "relkit_execution_outcomes_total" &&
            entry.attributes?.operation === "proxy.switch",
        )
        .map((entry) => entry.attributes?.outcome)
        .sort(),
    ).toEqual(["failure", "success"]);
  }),
);

it.effect("abort during native reader acquisition releases the installed body prefix", () =>
  Effect.gen(function* () {
    const caller = new AbortController();
    const reason = new Error("abort at reader acquisition");
    let cancelled = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        cancel: () => {
          cancelled++;
        },
      },
      { highWaterMark: 0 },
    );
    const getReader = stream.getReader.bind(stream);
    Object.defineProperty(stream, "getReader", {
      value: () => {
        caller.abort(reason);
        return getReader();
      },
    });
    yield* Effect.gen(function* () {
      const proxy = yield* SupervisorProxyOwner;
      yield* proxy.compareAndSwitch(undefined, { token, port: 3001 });
      const exit = yield* Effect.exit(
        proxy.handle(new Request("http://public.test/stream", { signal: caller.signal })),
      );
      expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toBe(reason);
      expect(cancelled).toBe(1);
      expect(stream.locked).toBe(false);
    }).pipe(
      Effect.provide(
        Layer.merge(
          createProxyLayer({ fetch: mockFetch(async () => new Response(stream)) }, "127.0.0.1"),
          quiet,
        ),
      ),
    );
  }),
);

it.effect("interruption during native lease admission still releases the acquired prefix", () =>
  Effect.gen(function* () {
    let caller: Fiber.Fiber<unknown, unknown> | undefined;
    let releases = 0;
    let aborts = 0;
    const layer = createProxyLayer(
      {
        track: () => {
          caller!.interruptUnsafe();
          return {
            token,
            signal: new AbortController().signal,
            release: () => {
              releases++;
            },
          };
        },
        fetch: mockFetch(
          (_input, init) =>
            new Promise<Response>((_resolve, reject) => {
              const signal = init!.signal!;
              /** Rejects the held native fetch on real cancellation. @returns After native settlement. */
              const aborted = () => {
                aborts++;
                reject(signal.reason);
              };
              if (signal.aborted) aborted();
              else signal.addEventListener("abort", aborted, { once: true });
            }),
        ),
      },
      "127.0.0.1",
    );
    yield* Effect.gen(function* () {
      const proxy = yield* SupervisorProxyOwner;
      yield* proxy.compareAndSwitch(undefined, { token, port: 3001 });
      const calling = yield* Effect.forkChild(
        Effect.withFiber((fiber) => {
          caller = fiber;
          return proxy.handle(new Request("http://public.test/interrupted"));
        }),
      );
      const exit = yield* Fiber.await(calling);
      expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true);
      expect(releases).toBe(1);
      expect(aborts).toBe(1);
    }).pipe(Effect.provide(Layer.merge(layer, quiet)));
  }),
);

it.effect("holds an admitted generation through headers and body EOF with one observation", () =>
  Effect.gen(function* () {
    const registry: Metric.MetricRegistry = new Map();
    const leaseController = new AbortController();
    let released = 0;
    const native = new Response("streamed");
    Object.defineProperty(native, "url", { value: "http://private.test/upstream" });
    const layer = createProxyLayer(
      {
        fetch: mockFetch(async () => native),
        track: () => ({
          token,
          signal: leaseController.signal,
          release: () => {
            released++;
          },
        }),
      },
      "127.0.0.1",
    );
    yield* Effect.gen(function* () {
      const proxy = yield* SupervisorProxyOwner;
      expect(yield* proxy.compareAndSwitch(undefined, { token, port: 3001 })).toBe(true);
      const response = yield* proxy.handle(new Request("http://public.test/stream"));
      expect(released).toBe(0);
      expect(response.url).toBe(native.url);
      expect(response.type).toBe(native.type);
      expect(response.redirected).toBe(native.redirected);
      const clone = response.clone();
      expect(clone.url).toBe(native.url);
      const clonedBody = clone.text();
      expect(
        yield* Effect.tryPromise({ try: () => response.text(), catch: (error) => error }),
      ).toBe("streamed");
      expect(yield* Effect.tryPromise({ try: () => clonedBody, catch: (error) => error })).toBe(
        "streamed",
      );
      expect(released).toBe(1);
    }).pipe(
      Effect.provide(Layer.merge(layer, quiet)),
      Effect.provideService(Metric.MetricRegistry, registry),
    );
    const outcomes = [...registry.values()].filter(
      (entry) =>
        entry.id === "relkit_execution_outcomes_total" &&
        entry.attributes?.operation === "proxy.request",
    );
    expect(outcomes.map((entry) => entry.attributes?.outcome)).toEqual(["success"]);
  }),
);

it.effect("retirement aborts a pending native body read and releases its reader exactly once", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    const released = yield* Deferred.make<void>();
    const lease = new AbortController();
    const caller = new AbortController();
    let cancellations = 0;
    let releases = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        /** Holds a real native pull. @returns A pending pull until native cancellation. */
        pull() {
          Deferred.doneUnsafe(entered, Effect.void);
          return new Promise<void>(() => undefined);
        },
        /** Records actual stream cancellation. @returns After counting cleanup. */
        cancel() {
          cancellations++;
        },
      },
      { highWaterMark: 0 },
    );
    const layer = createProxyLayer(
      {
        fetch: mockFetch(async () => new Response(stream)),
        track: () => ({
          token,
          signal: lease.signal,
          /** Releases the admitted generation. @returns After publishing lease completion. */
          release() {
            releases++;
            Deferred.doneUnsafe(released, Effect.void);
          },
        }),
      },
      "127.0.0.1",
    );
    yield* Effect.gen(function* () {
      const proxy = yield* SupervisorProxyOwner;
      yield* proxy.compareAndSwitch(undefined, { token, port: 3001 });
      const response = yield* proxy.handle(
        new Request("http://public.test/stream", { signal: caller.signal }),
      );
      const reader = response.body!.getReader();
      const reading = yield* Effect.forkChild(
        Effect.tryPromise({ try: () => reader.read(), catch: (error) => error }),
      );
      yield* Deferred.await(entered);
      const reason = new Error("generation retired");
      lease.abort(reason);
      const exit = yield* Fiber.await(reading);
      expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toBe(reason);
      yield* Deferred.await(released);
      expect(cancellations).toBe(1);
      expect(releases).toBe(1);
      expect(stream.locked).toBe(false);
      expect(caller.signal.aborted).toBe(false);
      reader.releaseLock();
    }).pipe(Effect.provide(Layer.merge(layer, quiet)));
  }),
);

it.effect("public stop joins pending body cancellation and permits a fresh generation owner", () =>
  Effect.tryPromise({
    try: async () => {
      let cancelled = 0;
      const stream = new ReadableStream<Uint8Array>(
        {
          pull: () => new Promise<void>(() => undefined),
          cancel: () => {
            cancelled++;
          },
        },
        { highWaterMark: 0 },
      );
      const proxy = createSupervisorProxy({
        fetch: mockFetch(async () => new Response(stream)),
        logger: { human: false, json: false },
      });
      try {
        proxy.switchTarget({ token, port: 3001 });
        const response = await proxy.handle(new Request("http://public.test/stream"));
        const reading = response.body!.getReader().read();
        void reading.catch(() => undefined);
        const closed = proxy.stop();
        expect(proxy.stop()).toBe(closed);
        await closed;
        await expect(reading).rejects.toThrow("Supervisor proxy request closed.");
        expect(cancelled).toBe(1);
        expect(stream.locked).toBe(false);
        expect(
          proxy.switchTarget({ token: { sourceToken: 2, generationToken: 2 }, port: 3002 }),
        ).toBe(true);
      } finally {
        await proxy.stop();
      }
    },
    catch: (error) => error,
  }),
);
