import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { createLoggerLayer } from "@relkit/runtime-effect/logger";
import { createSupervisorStateMachine } from "../../src/state-machine.js";
import { createWatcherLayer, SupervisorSourceWatcher } from "../../src/watcher-service.js";
import { createSupervisorWatcher } from "../../src/watcher.js";
import { nativeGate } from "../fixtures/native-gate.js";
import type { RecordedWatcherBatch } from "../fixtures/watcher.types.js";
import { Exit, Layer, Metric } from "effect";
import type { LogRecord } from "@relkit/runtime-effect/logger";

it.effect("standalone watcher records typed invalid admission and owned scheduling outcomes", () =>
  Effect.gen(function* () {
    const logs: LogRecord[] = [];
    const registry: Metric.MetricRegistry = new Map();
    const machine = createSupervisorStateMachine({ logger: { human: false, json: false } });
    yield* Effect.gen(function* () {
      const watcher = yield* SupervisorSourceWatcher;
      const invalid = yield* Effect.exit(watcher.notify({ version: -1 }));
      expect(
        Exit.isFailure(invalid) &&
          invalid.cause.reasons.some(
            (reason) => reason._tag === "Fail" && reason.error instanceof TypeError,
          ),
      ).toBe(true);
      yield* watcher.notify({ version: 1 });
      yield* watcher.flush;
      yield* watcher.dispose;
    }).pipe(
      Effect.provide(
        Layer.merge(
          createWatcherLayer({ compile: () => undefined }, machine),
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
    expect(logs[0]?.fields.outcome).toBe("failure");
    expect(
      [...registry.values()]
        .filter((entry) => entry.id === "relkit_execution_outcomes_total")
        .map((entry) => `${entry.attributes?.operation}:${entry.attributes?.outcome}`)
        .sort(),
    ).toEqual([
      "watcher.compile:success",
      "watcher.flush:success",
      "watcher.notify:failure",
      "watcher.notify:success",
      "watcher.stopAdmission:success",
    ]);
  }),
);

it.live("public close waits for a native compiler that settles after abort", () =>
  Effect.promise(async () => {
    const entered = nativeGate<AbortSignal>();
    const aborted = nativeGate<void>();
    const native = nativeGate<void>();
    const watcher = createSupervisorWatcher({
      logger: { human: false, json: false },
      compile: ({ signal }) => {
        signal.addEventListener("abort", () => aborted.complete(undefined), { once: true });
        entered.complete(signal);
        return native.promise;
      },
    });
    let settled = false;
    try {
      watcher.notify({ version: 1 });
      const flushing = watcher.flush();
      const signal = await entered.promise;
      const closing = watcher.close();
      void closing.then(() => {
        settled = true;
      });
      await aborted.promise;
      expect(signal.aborted).toBe(true);
      expect(settled).toBe(false);
      native.complete(undefined);
      await closing;
      await flushing;
      expect(settled).toBe(true);
    } finally {
      native.complete(undefined);
      await watcher.close();
    }
  }),
);

it.effect("debounce uses injected time and retains only the newest coalesced batch", () =>
  Effect.gen(function* () {
    const batches: RecordedWatcherBatch[] = [];
    const entered = yield* Deferred.make<void>();
    const machine = createSupervisorStateMachine({ logger: { human: false, json: false } });
    yield* Effect.gen(function* () {
      const watcher = yield* SupervisorSourceWatcher;
      yield* watcher.notify({ version: 1, changedFiles: ["one.ts"] });
      yield* watcher.notify({ version: 2, changedFiles: ["two.ts"] });
      yield* TestClock.adjust(99);
      expect(batches).toEqual([]);
      yield* TestClock.adjust(1);
      yield* Deferred.await(entered);
      yield* watcher.flush;
      expect(batches).toEqual([{ version: 2, changedFiles: ["one.ts", "two.ts"] }]);
      expect(machine.state).toBe("starting-candidate");
    }).pipe(
      Effect.provide(
        createWatcherLayer(
          {
            debounceMs: 100,
            compile: (request) => {
              batches.push({ version: request.version, changedFiles: request.changedFiles });
              Deferred.doneUnsafe(entered, Effect.void);
            },
          },
          machine,
        ),
      ),
    );
  }).pipe(Effect.provide(createLoggerLayer({ human: false, json: false }))),
);

it.effect("disposal aborts the native pending compiler and flush joins completion", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<AbortSignal>();
    let aborted = 0;
    const machine = createSupervisorStateMachine({ logger: { human: false, json: false } });
    yield* Effect.gen(function* () {
      const watcher = yield* SupervisorSourceWatcher;
      yield* watcher.notify({ version: 1 });
      const flushing = yield* Effect.forkChild(watcher.flush);
      const signal = yield* Deferred.await(entered);
      yield* watcher.dispose;
      expect(signal.aborted).toBe(true);
      yield* Fiber.join(flushing);
      expect(aborted).toBe(1);
      expect(machine.state).toBe("idle");
    }).pipe(
      Effect.provide(
        createWatcherLayer(
          {
            compile: ({ signal }) =>
              new Promise<void>((_resolve, reject) => {
                signal.addEventListener(
                  "abort",
                  () => {
                    aborted++;
                    reject(signal.reason);
                  },
                  { once: true },
                );
                Deferred.doneUnsafe(entered, Effect.succeed(signal));
              }),
          },
          machine,
        ),
      ),
    );
  }).pipe(Effect.provide(createLoggerLayer({ human: false, json: false }))),
);

it.live("public close shares scope cleanup and retains synchronous disposed errors", () =>
  Effect.promise(async () => {
    let reentrantClose: Promise<void> | undefined;
    /** Announces compiler entry. @param signal - Owned compiler signal. @returns After fixture notification. */
    let enter: (signal: AbortSignal) => void = () => undefined;
    const entered = new Promise<AbortSignal>((resolve) => {
      enter = resolve;
    });
    const watcher = createSupervisorWatcher({
      logger: { human: false, json: false },
      compile: ({ signal }) =>
        new Promise<void>((resolve) => {
          signal.addEventListener(
            "abort",
            () => {
              reentrantClose = watcher.close();
              resolve();
            },
            { once: true },
          );
          enter(signal);
        }),
    });
    try {
      watcher.notify({ version: 3 });
      const flushing = watcher.flush();
      const signal = await entered;
      const closed = watcher.close();
      expect(reentrantClose).toBe(closed);
      expect(watcher.close()).toBe(closed);
      expect(signal.aborted).toBe(true);
      await closed;
      await flushing;
      expect(watcher.version).toBe(3);
      expect(() => watcher.notify({ version: 4 })).toThrow("Supervisor watcher is disposed.");
    } finally {
      await watcher.close();
    }
  }),
);

it.live("a reentrant activation listener cannot overwrite newer watcher admission", () =>
  Effect.promise(async () => {
    const compiled: number[] = [];
    const machine = createSupervisorStateMachine({ logger: { human: false, json: false } });
    const watcher = createSupervisorWatcher({
      stateMachine: machine,
      logger: { human: false, json: false },
      compile: ({ version }) => {
        compiled.push(version);
      },
    });
    const unsubscribe = machine.subscribe((event) => {
      if (
        event.type === "transition" &&
        event.to === "compiling-candidate" &&
        event.sourceToken === 1
      )
        watcher.notify({ version: 2, changedFiles: ["second.ts"] });
    });
    try {
      watcher.notify({ version: 1, changedFiles: ["first.ts"] });
      await watcher.flush();
      expect(watcher.version).toBe(2);
      expect(compiled).toEqual([2]);
      expect(machine.snapshot().candidate?.sourceToken).toBe(2);
    } finally {
      unsubscribe();
      await watcher.close();
    }
  }),
);
