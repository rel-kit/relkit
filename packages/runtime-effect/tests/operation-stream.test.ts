import { expect, it } from "@effect/vitest";
import { Cause, Deferred, Effect, Exit, Fiber, Metric, Stream } from "effect";
import { TestClock } from "effect/testing";
import { createLoggerLayer, type LogRecord } from "../src/logger.js";
import { observeExecution } from "../src/operation.js";
import { observeExecutionStream } from "../src/operation-stream.js";
import { createRelkitTracer, type SpanLifecycle } from "../src/tracing-span.js";

it.effect("keeps the named lifetime span open until stream consumption completes", () =>
  Effect.gen(function* () {
    const events: SpanLifecycle[] = [];
    let sequence = 0;
    const tracer = createRelkitTracer(
      {
        next: (kind) =>
          (++sequence).toString(16).padStart(kind === "trace" ? 32 : 16, "0") as never,
      },
      (event) => events.push(event),
    );
    const pulled = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    const source = observeExecutionStream(
      "runtime",
      "test.stream-trace",
      Stream.fromEffect(
        Effect.currentSpan.pipe(
          Effect.tap((span) => Effect.sync(() => expect(span.name).toBe("Execution.stream"))),
          Effect.andThen(Deferred.succeed(pulled, undefined)),
          Effect.andThen(Deferred.await(release)),
          Effect.as(1),
        ),
      ),
    );
    expect(events).toEqual([]);
    const fiber = yield* Stream.runCollect(source).pipe(
      Effect.withTracer(tracer),
      Effect.forkChild,
    );
    yield* Deferred.await(pulled);
    expect(
      events.filter((event) => event.type === "started" && event.span.name === "Execution.stream"),
    ).toHaveLength(1);
    expect(events.filter((event) => event.type === "completed")).toHaveLength(0);
    yield* TestClock.adjust(125);
    yield* Deferred.succeed(release, undefined);
    expect(yield* Fiber.join(fiber)).toEqual([1]);
    const completed = events.filter(
      (event) => event.type === "completed" && event.span.name === "Execution.stream",
    );
    expect(completed).toHaveLength(1);
    expect(completed[0]?.span.attributes.get("execution.operation")).toBe("test.stream-trace");
    expect(completed[0]?.span.attributes.get("execution.duration_ms")).toBe(125);
  }),
);

it.effect("starts stream observation lazily and joins terminal duration", () =>
  Effect.gen(function* () {
    const records: LogRecord[] = [];
    const pulled = yield* Deferred.make<void>();
    const source = observeExecutionStream(
      "runtime",
      "test.stream",
      Stream.fromEffect(
        Deferred.succeed(pulled, undefined).pipe(Effect.andThen(Effect.sleep(20)), Effect.as(1)),
      ),
    );
    const counter = Metric.withAttributes(
      Metric.counter("relkit_execution_operations_total", { incremental: true }),
      { domain: "runtime", operation: "test.stream" },
    );
    yield* Effect.gen(function* () {
      expect((yield* Metric.value(counter)).count).toBe(0);
      const consume = yield* Stream.runCollect(source).pipe(Effect.forkChild);
      yield* Deferred.await(pulled);
      yield* TestClock.adjust(20);
      expect(yield* Fiber.join(consume)).toEqual([1]);
      expect((yield* Metric.value(counter)).count).toBe(1);
    }).pipe(
      Effect.provideService(Metric.MetricRegistry, new Map()),
      Effect.provide(
        createLoggerLayer({
          human: { write: (_line, record) => records.push(record) },
          json: false,
        }),
      ),
    );
    expect(records.map((record) => record.fields.outcome)).toEqual(["success"]);
    expect(records[0]?.fields.duration_ms).toBe(20);
  }),
);

it.effect("keeps failure and defect causes while observing stream outcomes", () =>
  Effect.gen(function* () {
    const records: LogRecord[] = [];
    yield* Effect.gen(function* () {
      const failed = yield* Stream.runCollect(
        observeExecutionStream("runtime", "test.failure", Stream.fail("original")),
      ).pipe(Effect.exit);
      expect(Exit.isFailure(failed)).toBe(true);
      expect(
        Exit.isFailure(failed) &&
          failed.cause.reasons.some(
            (reason) => Cause.isFailReason(reason) && reason.error === "original",
          ),
      ).toBe(true);
      const defect = yield* Stream.runCollect(
        observeExecutionStream("runtime", "test.defect", Stream.die("bug")),
      ).pipe(Effect.exit);
      expect(Exit.isFailure(defect)).toBe(true);
      expect(
        Exit.isFailure(defect) &&
          defect.cause.reasons.some(
            (reason) => Cause.isDieReason(reason) && reason.defect === "bug",
          ),
      ).toBe(true);
    }).pipe(
      Effect.provide(
        createLoggerLayer({
          human: { write: (_line, record) => records.push(record) },
          json: false,
        }),
      ),
    );
    expect(records.map((record) => record.fields.outcome)).toEqual(["failure", "defect"]);
  }),
);

it.effect("early return joins stream resource cleanup and records interruption once", () =>
  Effect.gen(function* () {
    let released = 0;
    const records: LogRecord[] = [];
    const source = Stream.unwrap(
      Effect.gen(function* () {
        yield* Effect.acquireRelease(Effect.void, () =>
          Effect.sync(() => {
            released++;
          }),
        );
        return Stream.make(1, 2);
      }),
    );
    const values = yield* Stream.runCollect(
      observeExecutionStream("runtime", "test.return", source).pipe(Stream.take(1)),
    ).pipe(
      Effect.provide(
        createLoggerLayer({
          human: { write: (_line, record) => records.push(record) },
          json: false,
          minimumLevel: "trace",
        }),
      ),
    );
    expect(values).toEqual([1]);
    expect(released).toBe(1);
    expect(records.map((record) => record.fields.outcome)).toEqual(["interrupted"]);
  }),
);

it.effect("omits terminal counters for suspension and isolates a broken policy", () =>
  Effect.gen(function* () {
    const registry = new Map();
    const marker = {};
    const outcomes = Metric.withAttributes(
      Metric.counter("relkit_execution_outcomes_total", { incremental: true }),
      { domain: "runtime", operation: "test.suspend", outcome: "failure" },
    );
    yield* Effect.gen(function* () {
      const suspended = yield* observeExecution(
        "runtime",
        "test.suspend",
        Effect.fail(marker),
        undefined,
        () => false,
      ).pipe(Effect.exit);
      expect(
        Exit.isFailure(suspended) &&
          suspended.cause.reasons.some(
            (reason) => reason._tag === "Fail" && reason.error === marker,
          ),
      ).toBe(true);
      expect((yield* Metric.value(outcomes)).count).toBe(0);
      expect(
        yield* observeExecution("runtime", "test.policy", Effect.succeed(42), undefined, () => {
          throw new Error("observer");
        }),
      ).toBe(42);
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry));
  }),
);
