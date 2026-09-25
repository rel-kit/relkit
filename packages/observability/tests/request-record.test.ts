import { expect, test } from "vitest";
import { Effect, Metric } from "effect";
import { TestClock } from "effect/testing";
import { createRequestRecordBuilder, REQUEST_OUTCOMES } from "../src/index.ts";
import { makeRequestRecordBuilderEffect } from "../src/request-record-effect.js";
test("emits discoverable starts and one authoritative completion without a stored timeline", () => {
  const builder = createRequestRecordBuilder({
    requestId: "request.test",
    traceId: "10000000000000000000000000000001",
    generationId: "generation.test",
    graphHash: "sha256:test",
    method: "GET",
    rawPath: "/hello",
    startedAt: 0,
    now: () => 1,
  });
  builder.setRoute("hello.route", "hello");
  builder.setInvocationId("invocation.root");
  builder.add({ kind: "accepted", at: 0 });
  const completed = builder.finish({ status: 200, completedAt: 1 });
  expect(builder.started).toMatchObject({ phase: "started", requestId: "request.test" });
  expect(builder.started).not.toHaveProperty("completedAt");
  expect(completed).toMatchObject({
    phase: "completed",
    routeId: "hello.route",
    functionId: "hello",
    invocationId: "invocation.root",
    outcome: "success",
  });
  expect(completed).not.toHaveProperty("timeline");
  expect(builder.finish({ status: 500 })).toBe(completed);
});
test("records every request outcome and preserves declared error identity", () => {
  const cases = [
    ["success", 200],
    ["declared-error", 409],
    ["validation-error", 422],
    ["timeout", 504],
    ["cancelled", 499],
    ["defect", 500],
  ] as const;
  const records = cases.map(([outcome, status], index) => {
    const builder = createRequestRecordBuilder({
      requestId: `request.${index}`,
      traceId: `${index + 1}`.padStart(32, "0"),
      generationId: "generation.test",
      graphHash: "sha256:test",
      method: "GET",
      rawPath: "/orders",
      startedAt: 0,
      now: () => 1,
    });
    builder.setOutcome(outcome, outcome === "declared-error" ? "orders.conflict" : undefined);
    return builder.finish({ status, completedAt: 1 });
  });
  expect(records.map(({ outcome }) => outcome)).toEqual([...REQUEST_OUTCOMES]);
  expect(records[1]).toMatchObject({ outcome: "declared-error", errorId: "orders.conflict" });
  expect(records.map(({ status }) => status)).toEqual(cases.map(([, status]) => status));
});
test("Effect builder uses the test clock and records operation metrics", async () => {
  const registry = new Map();
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      yield* TestClock.setTime(1_000);
      const builder = yield* makeRequestRecordBuilderEffect({
        requestId: "request.effect",
        traceId: "10000000000000000000000000000001",
        generationId: "generation.test",
        graphHash: "sha256:test",
        method: "GET",
        rawPath: "/hello",
      });
      yield* builder.setRoute("hello.route", "hello");
      yield* TestClock.setTime(1_125);
      const completed = yield* builder.finish({ status: 200 });
      const metric = yield* Metric.value(
        Metric.counter("relkit_observability_request_record_operations_total", {
          attributes: { operation: "finish", outcome: "success" },
        }),
      );
      return { started: builder.started, completed, metric };
    }).pipe(
      Effect.provide(TestClock.layer()),
      Effect.provideService(Metric.MetricRegistry, registry),
    ),
  );
  expect(result.started.startedAt).toBe("1970-01-01T00:00:01.000Z");
  expect(result.completed.durationMs).toBe(125);
  expect(result.completed.routeId).toBe("hello.route");
  expect(result.metric.count).toBe(1);
});
test("invalid time is tagged in Effect and keeps the adapter RangeError", async () => {
  const options = {
    requestId: "request.invalid",
    traceId: "10000000000000000000000000000001",
    generationId: "generation.test",
    graphHash: "sha256:test",
    method: "GET",
    rawPath: "/hello",
    startedAt: Number.NaN,
  };
  const failure = await Effect.runPromise(
    makeRequestRecordBuilderEffect(options).pipe(Effect.flip),
  );
  expect(failure).toMatchObject({ _tag: "RequestRecordError", field: "startedAt" });
  expect(() => createRequestRecordBuilder(options)).toThrow(RangeError);
  const outOfRange = { ...options, startedAt: 8_640_000_000_000_001 };
  const rangeFailure = await Effect.runPromise(
    makeRequestRecordBuilderEffect(outOfRange).pipe(Effect.flip),
  );
  expect(rangeFailure).toMatchObject({ _tag: "RequestRecordError", field: "startedAt" });
  const builder = await Effect.runPromise(
    makeRequestRecordBuilderEffect({ ...options, startedAt: 0 }),
  );
  const finishFailure = await Effect.runPromise(
    builder.finish({ status: 200, completedAt: 8_640_000_000_000_001 }).pipe(Effect.flip),
  );
  expect(finishFailure).toMatchObject({ _tag: "RequestRecordError", field: "completedAt" });
});
test("Effect builder methods update the final record and report invalid completion", async () => {
  const registry = new Map();
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const builder = yield* makeRequestRecordBuilderEffect({
        requestId: "request.methods",
        traceId: "10000000000000000000000000000001",
        generationId: "generation.test",
        graphHash: "sha256:test",
        method: "POST",
        rawPath: "/orders",
        startedAt: 0,
      });
      yield* builder.add({ kind: "accepted" });
      yield* builder.setTraceId("20000000000000000000000000000002");
      yield* builder.setRoute("orders.create", "create");
      yield* builder.setServiceId("orders");
      yield* builder.setInvocationId("invocation.methods");
      yield* builder.setOutcome("declared-error", "orders.conflict");
      const error = yield* builder
        .finish({ status: 409, completedAt: Number.POSITIVE_INFINITY })
        .pipe(Effect.flip);
      const completed = yield* builder.finish({ status: 409, completedAt: 10 });
      const failure = yield* Metric.value(
        Metric.counter("relkit_observability_request_record_operations_total", {
          attributes: { operation: "finish", outcome: "failure" },
        }),
      );
      return { completed, error, failure };
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  expect(result.error).toMatchObject({ _tag: "RequestRecordError", field: "completedAt" });
  expect(result.completed).toMatchObject({
    traceId: "20000000000000000000000000000002",
    routeId: "orders.create",
    serviceId: "orders",
    invocationId: "invocation.methods",
    outcome: "declared-error",
    errorId: "orders.conflict",
  });
  expect(result.failure.count).toBe(1);
});
