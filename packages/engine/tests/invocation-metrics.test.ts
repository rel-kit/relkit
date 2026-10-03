import { expect, it } from "@effect/vitest";
import { cancellationFailure, unexpectedDefect } from "@relkit/invocation";
import { defineTask, encodeJobWire } from "@relkit/jobs";
import { createLoggerLayer, type LogRecord } from "@relkit/runtime-effect";
import { z } from "@relkit/schema";
import { Deferred, Effect, Fiber, Logger, Metric } from "effect";
import { TestClock } from "effect/testing";
import { vi } from "vitest";
import { enginePromise, runEnginePromise, runEngineSync } from "../src/engine-runtime.js";
import { TaskExecutionLive, TaskExecutionService } from "../src/execution.service.js";
import type { InvocationTarget } from "../src/invoke-types.js";
import { InvocationLive, InvocationService, InvocationValidationError } from "../src/invoke.js";

const outcomes = ["success", "failure", "defect", "interrupted"] as const;
const counter = (operation: string, outcome?: string) =>
  Metric.value(
    Metric.withAttributes(
      Metric.counter(
        outcome === undefined
          ? "relkit_execution_operations_total"
          : "relkit_execution_outcomes_total",
        { incremental: true },
      ),
      { domain: "engine", operation, ...(outcome === undefined ? {} : { outcome }) },
    ),
  ).pipe(Effect.map((state) => state.count));
const duration = (operation: string) =>
  Metric.value(
    Metric.withAttributes(
      Metric.histogram("relkit_execution_duration_ms", {
        boundaries: [0.01, 0.1, 1, 5, 10, 50, 100, 1000, 10000],
      }),
      { domain: "engine", operation },
    ),
  );
const isolated = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.provideService(Metric.MetricRegistry, new Map()),
    Effect.provideService(Logger.CurrentLoggers, new Set()),
  );
const assertOutcome = (operation: string, expected: (typeof outcomes)[number] | undefined) =>
  Effect.gen(function* () {
    expect(yield* counter(operation)).toBe(1);
    for (const outcome of outcomes)
      expect(yield* counter(operation, outcome)).toBe(outcome === expected ? 1 : 0);
    expect((yield* duration(operation)).count).toBe(expected === undefined ? 0 : 1);
  });

it.effect("measures one live invocation across a controlled handler wait", () =>
  isolated(
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const invocation = yield* InvocationService;
      const fiber = yield* invocation
        .invoke<number, number>({
          target: {
            id: "metric.success",
            input: z.number(),
            output: z.number(),
            handler: async (input) => {
              runEngineSync(Deferred.succeed(started, undefined));
              await runEnginePromise(Deferred.await(release));
              return input + 1;
            },
          },
          input: 4,
        })
        .pipe(Effect.forkChild);
      yield* Deferred.await(started);
      expect(yield* counter("invocation.invoke")).toBe(1);
      expect(yield* counter("invocation.invoke", "success")).toBe(0);
      yield* TestClock.adjust(250);
      yield* Deferred.succeed(release, undefined);
      expect(yield* Fiber.join(fiber)).toBe(5);
      yield* assertOutcome("invocation.invoke", "success");
      expect((yield* duration("invocation.invoke")).sum).toBe(250);
    }).pipe(Effect.provide(InvocationLive)),
  ),
);

it.effect("records validation failure and preserves the completion error instance", () =>
  isolated(
    Effect.gen(function* () {
      let completionError: unknown;
      const result = yield* (yield* InvocationService)
        .invoke({
          target: {
            id: "metric.validation",
            input: z.number(),
            output: z.number(),
            handler: (input) => input,
          },
          input: "invalid" as unknown as number,
          hooks: {
            onCompletion: (event) => {
              completionError = event.error;
            },
          },
        })
        .pipe(Effect.result);
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure).toBeInstanceOf(InvocationValidationError);
        expect(result.failure).toBe(completionError);
      }
      yield* assertOutcome("invocation.invoke", "failure");
    }).pipe(Effect.provide(InvocationLive)),
  ),
);

it.effect("records normalized defects without wrapping their public identity", () =>
  isolated(
    Effect.gen(function* () {
      const failure = unexpectedDefect(new Error("private failure"));
      const result = yield* (yield* InvocationService)
        .invoke({
          target: {
            id: "metric.defect",
            input: z.unknown(),
            output: z.unknown(),
            handler: () => {
              throw failure;
            },
          },
          input: null,
        })
        .pipe(Effect.result);
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure).toBe(failure);
      yield* assertOutcome("invocation.invoke", "defect");
    }).pipe(Effect.provide(InvocationLive)),
  ),
);

it.effect("records pre-aborted requests as interrupted without invoking the handler", () =>
  isolated(
    Effect.gen(function* () {
      const failure = cancellationFailure(new Error("cancelled before start"));
      const controller = new AbortController();
      controller.abort(failure);
      let called = false;
      const result = yield* (yield* InvocationService)
        .invoke({
          target: {
            id: "metric.abort",
            input: z.unknown(),
            output: z.unknown(),
            handler: () => {
              called = true;
            },
          },
          input: null,
          signal: controller.signal,
        })
        .pipe(Effect.result);
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure).toBe(failure);
      expect(called).toBe(false);
      yield* assertOutcome("invocation.invoke", "interrupted");
    }).pipe(Effect.provide(InvocationLive)),
  ),
);

it.effect("records interruption after native invocation cleanup has completed", () =>
  isolated(
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      let releases = 0;
      const fiber = yield* (yield* InvocationService)
        .invoke({
          target: {
            id: "metric.interrupt",
            input: z.unknown(),
            output: z.unknown(),
            handler: (_input, context) =>
              new Promise((_resolve, reject) => {
                context.signal.addEventListener("abort", () => reject(context.signal.reason), {
                  once: true,
                });
                runEngineSync(Deferred.succeed(started, undefined));
              }),
          },
          input: null,
          admit: () => ({
            release: () => {
              releases++;
            },
          }),
        })
        .pipe(Effect.forkChild);
      yield* Deferred.await(started);
      yield* Fiber.interrupt(fiber);
      expect(releases).toBe(1);
      yield* assertOutcome("invocation.invoke", "interrupted");
    }).pipe(Effect.provide(InvocationLive)),
  ),
);

it.effect("leaves opaque task suspension nonterminal in both owning operations", () =>
  isolated(
    Effect.gen(function* () {
      const marker = { continuation: "resume-later" };
      const hooks: string[] = [];
      const task = defineTask({
        id: "metric.suspend",
        version: "1",
        input: z.number(),
        output: z.number(),
        handler: async () => {
          throw marker;
        },
        onStart: async () => {
          hooks.push("start");
        },
        onSuccess: async () => {
          hooks.push("success");
        },
        onFailure: async () => {
          hooks.push("failure");
        },
      });
      const envelope = {
        runId: "metric.run",
        jobId: "metric.job",
        taskId: task.id,
        taskVersion: task.version,
        buildId: "metric.build",
        input: encodeJobWire(1),
      };
      const result = yield* (yield* TaskExecutionService)
        .execute(
          envelope,
          {
            run: envelope,
            signal: new AbortController().signal,
            isSuspension: (cause) => cause === marker,
          },
          { tasks: { [task.id]: task } },
        )
        .pipe(Effect.result);
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure).toBe(marker);
      expect(hooks).toEqual(["start"]);
      yield* assertOutcome("invocation.invoke", undefined);
      yield* assertOutcome("task.execute", undefined);
    }).pipe(Effect.provide(TaskExecutionLive)),
  ),
);

for (const ending of ["eof", "failure", "cancel"] as const) {
  it.effect(`observes lazy stream lifetime through ${ending}`, () =>
    isolated(
      Effect.gen(function* () {
        const failure = unexpectedDefect(new Error("stream defect"));
        let handlerCalls = 0;
        let releases = 0;
        const output = { ...z.unknown(), kind: "stream", item: z.number() };
        const target: InvocationTarget<unknown, AsyncIterable<number>> = {
          id: "metric.stream",
          input: z.unknown(),
          output,
          handler: async function* () {
            handlerCalls++;
            yield 1;
            if (ending === "failure") throw failure;
            if (ending === "cancel") yield 2;
          },
        };
        const stream = yield* (yield* InvocationService).invoke({
          target,
          input: null,
          admit: () => ({
            release: () => {
              releases++;
            },
          }),
        });
        expect(handlerCalls).toBe(0);
        expect(yield* counter("invocation.invoke")).toBe(0);
        const iterator = stream[Symbol.asyncIterator]();
        try {
          expect(yield* enginePromise(() => iterator.next())).toEqual({ value: 1, done: false });
          expect(handlerCalls).toBe(1);
          expect(yield* counter("invocation.invoke")).toBe(1);
          expect((yield* duration("invocation.invoke")).count).toBe(0);
          yield* TestClock.adjust(100);
          if (ending === "failure") {
            const result = yield* enginePromise(() => iterator.next()).pipe(Effect.result);
            expect(result._tag).toBe("Failure");
            if (result._tag === "Failure") expect(result.failure).toBe(failure);
          } else if (ending === "cancel") {
            yield* enginePromise(() => iterator.return!(undefined));
            yield* enginePromise(() => iterator.return!(undefined));
          } else expect((yield* enginePromise(() => iterator.next())).done).toBe(true);
          expect(releases).toBe(1);
          yield* assertOutcome(
            "invocation.invoke",
            ending === "eof" ? "success" : ending === "failure" ? "defect" : "interrupted",
          );
          expect((yield* duration("invocation.invoke")).sum).toBe(100);
        } finally {
          yield* enginePromise(() => iterator.return!(undefined));
        }
      }).pipe(Effect.provide(InvocationLive)),
    ),
  );
}

it.effect("keeps a returned stream alive after the creation scope closes", () =>
  isolated(
    Effect.gen(function* () {
      let releases = 0;
      const stream = yield* Effect.scoped(
        (yield* InvocationService).invoke({
          target: {
            id: "metric.transferred-stream",
            input: z.unknown(),
            output: { ...z.unknown(), kind: "stream", item: z.number() },
            handler: async function* () {
              yield 7;
            },
          } as InvocationTarget<unknown, AsyncIterable<number>>,
          input: null,
          admit: () => ({
            release: () => {
              releases++;
            },
          }),
        }),
      );
      const iterator = stream[Symbol.asyncIterator]();
      try {
        expect(yield* enginePromise(() => iterator.next())).toEqual({ value: 7, done: false });
        expect((yield* enginePromise(() => iterator.next())).done).toBe(true);
        expect(releases).toBe(1);
        yield* assertOutcome("invocation.invoke", "success");
      } finally {
        yield* enginePromise(() => iterator.return!(undefined));
      }
    }).pipe(Effect.provide(InvocationLive)),
  ),
);

it.effect("returns during the first pending pull by aborting and joining native admission", () =>
  isolated(
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      let releases = 0;
      let aborted = false;
      const stream = yield* (yield* InvocationService).invoke({
        target: {
          id: "metric.pending-stream",
          input: z.unknown(),
          output: { ...z.unknown(), kind: "stream", item: z.number() },
          handler: async (_input, context) => {
            await new Promise<void>((resolve) => {
              context.signal.addEventListener(
                "abort",
                () => {
                  aborted = true;
                  resolve();
                },
                { once: true },
              );
              runEngineSync(Deferred.succeed(started, undefined));
            });
            return (async function* () {
              yield 1;
            })();
          },
        } as InvocationTarget<unknown, AsyncIterable<number>>,
        input: null,
        admit: () => ({
          release: () => {
            releases++;
          },
        }),
      });
      const iterator = stream[Symbol.asyncIterator]();
      const pending = iterator.next();
      yield* Deferred.await(started);
      expect((yield* enginePromise(() => iterator.return!(undefined))).done).toBe(true);
      expect((yield* enginePromise(() => pending)).done).toBe(true);
      expect(aborted).toBe(true);
      expect(releases).toBe(1);
      yield* assertOutcome("invocation.invoke", "interrupted");
    }).pipe(Effect.provide(InvocationLive)),
  ),
);

it.effect("retains opaque suspension without a terminal outcome when opening a stream", () =>
  isolated(
    Effect.gen(function* () {
      const marker = { continuation: "stream-open" };
      let completions = 0;
      const stream = yield* (yield* InvocationService).invoke({
        target: {
          id: "metric.stream-suspension",
          input: z.unknown(),
          output: { ...z.unknown(), kind: "stream", item: z.number() },
          handler: () => {
            throw marker;
          },
        } as InvocationTarget<unknown, AsyncIterable<number>>,
        input: null,
        isSuspension: (cause) => cause === marker,
        hooks: {
          onCompletion: () => {
            completions++;
          },
        },
      });
      const iterator = stream[Symbol.asyncIterator]();
      const result = yield* enginePromise(() => iterator.next()).pipe(Effect.result);
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure).toBe(marker);
      expect((yield* enginePromise(() => iterator.return!(undefined))).done).toBe(true);
      expect(completions).toBe(0);
      yield* assertOutcome("invocation.invoke", undefined);
    }).pipe(Effect.provide(InvocationLive)),
  ),
);

it.effect("keeps failed stream opening silent with an explicitly empty logger set", () =>
  isolated(
    Effect.gen(function* () {
      const failure = unexpectedDefect(new Error("private stream failure"));
      const output = vi.spyOn(console, "log");
      try {
        const stream = yield* (yield* InvocationService).invoke({
          target: {
            id: "metric.stream-quiet",
            input: z.unknown(),
            output: { ...z.unknown(), kind: "stream", item: z.number() },
            handler: () => {
              throw failure;
            },
          } as InvocationTarget<unknown, AsyncIterable<number>>,
          input: null,
        });
        const result = yield* enginePromise(() => stream[Symbol.asyncIterator]().next()).pipe(
          Effect.result,
        );
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") expect(result.failure).toBe(failure);
        expect(output).not.toHaveBeenCalled();
        yield* assertOutcome("invocation.invoke", "defect");
      } finally {
        output.mockRestore();
      }
    }).pipe(Effect.provide(InvocationLive)),
  ),
);

it.effect("uses the captured logger for an iterator cleanup failure", () => {
  const records: LogRecord[] = [];
  return Effect.gen(function* () {
    const cleanupError = new Error("cleanup rejected");
    const stream = yield* (yield* InvocationService).invoke({
      target: {
        id: "metric.cleanup-logger",
        input: z.unknown(),
        output: { ...z.unknown(), kind: "stream", item: z.number() },
        handler: () => ({
          [Symbol.asyncIterator]: () => ({
            next: async () => ({ done: true, value: undefined }),
            return: async () => {
              throw cleanupError;
            },
          }),
        }),
      } as InvocationTarget<unknown, AsyncIterable<number>>,
      input: null,
    });
    const iterator = stream[Symbol.asyncIterator]();
    const result = yield* enginePromise(() => iterator.next()).pipe(Effect.result);
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") expect(result.failure).toBe(cleanupError);
    expect(records.some((record) => record.fields.operation === "invocation.invoke")).toBe(true);
  }).pipe(
    Effect.provide(InvocationLive),
    Effect.provide(
      createLoggerLayer({ human: false, json: { write: (record) => records.push(record) } }),
    ),
  );
});

it.effect("aborts an acquired source while its next pull is pending", () =>
  isolated(
    Effect.gen(function* () {
      const pulling = yield* Deferred.make<void>();
      let released = 0;
      const stream = yield* (yield* InvocationService).invoke({
        target: {
          id: "metric.active-pull",
          input: z.unknown(),
          output: { ...z.unknown(), kind: "stream", item: z.number() },
          handler: async function* (_input, context) {
            yield 1;
            await new Promise<void>((_resolve, reject) => {
              context.signal.addEventListener("abort", () => reject(context.signal.reason), {
                once: true,
              });
              runEngineSync(Deferred.succeed(pulling, undefined));
            });
          },
        } as InvocationTarget<unknown, AsyncIterable<number>>,
        input: null,
        admit: () => ({
          release: () => {
            released++;
          },
        }),
      });
      const iterator = stream[Symbol.asyncIterator]();
      yield* enginePromise(() => iterator.next());
      const pending = iterator.next();
      yield* Deferred.await(pulling);
      expect((yield* enginePromise(() => iterator.return!(undefined))).done).toBe(true);
      expect((yield* enginePromise(() => pending)).done).toBe(true);
      expect(released).toBe(1);
      yield* assertOutcome("invocation.invoke", "interrupted");
    }).pipe(Effect.provide(InvocationLive)),
  ),
);

it.effect("rejects a second consumer without cancelling the active stream", () =>
  isolated(
    Effect.gen(function* () {
      const stream = yield* (yield* InvocationService).invoke({
        target: {
          id: "metric.single-consumer",
          input: z.unknown(),
          output: { ...z.unknown(), kind: "stream", item: z.number() },
          handler: async function* () {
            yield 1;
            yield 2;
          },
        } as InvocationTarget<unknown, AsyncIterable<number>>,
        input: null,
      });
      const first = stream[Symbol.asyncIterator]();
      expect((yield* enginePromise(() => first.next())).value).toBe(1);
      const second = stream[Symbol.asyncIterator]();
      const failed = yield* enginePromise(() => second.next()).pipe(Effect.result);
      expect(failed._tag).toBe("Failure");
      if (failed._tag === "Failure")
        expect(failed.failure).toMatchObject({ code: "RELKIT_STREAM_ALREADY_CONSUMED" });
      yield* enginePromise(() => second.return!(undefined)).pipe(Effect.exit);
      expect((yield* enginePromise(() => first.next())).value).toBe(2);
      expect((yield* enginePromise(() => first.next())).done).toBe(true);
    }).pipe(Effect.provide(InvocationLive)),
  ),
);
