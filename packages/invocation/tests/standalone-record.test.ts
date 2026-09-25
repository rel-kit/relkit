import { describe, expect, test } from "vitest";
import { Effect, Layer } from "effect";
import { InvocationTelemetry } from "../src/index.js";
import {
  StandaloneDeadlineError,
  StandaloneIdSourceFailure,
  StandaloneRecordError,
  calculateStandaloneDeadline,
  calculateStandaloneDeadlineEffect,
  completeStandaloneRecord,
  completeStandaloneRecordEffect,
  createStandaloneRecord,
  createStandaloneRecordEffect,
  standaloneParent,
  standaloneParentEffect,
} from "../src/standalone-utils.js";
import type { InvocationOperation } from "../src/index.js";

const ids = {
  next: () => "invocation-1" as import("@relkit/contracts").ProtocolId,
};

describe("standalone invocation records", () => {
  test("chooses the earliest valid deadline and tags invalid inputs", () => {
    const parent = {
      id: "parent",
      traceId: "trace",
      signal: new AbortController().signal,
      deadlineMs: 300,
    };
    expect(
      Effect.runSync(calculateStandaloneDeadlineEffect(100, { timeoutMs: 50 }, parent, 200)),
    ).toBe(250);
    expect(calculateStandaloneDeadline(undefined, {}, parent, 200)).toBe(300);
    const failure = Effect.runSync(
      Effect.catchTag(
        calculateStandaloneDeadlineEffect(-1, {}, undefined, 0),
        "StandaloneDeadlineError",
        (e) => Effect.succeed(e),
      ),
    );
    expect(failure).toBeInstanceOf(StandaloneDeadlineError);
    expect(failure.field).toBe("timeoutMs");
    expect(() => calculateStandaloneDeadline(-1, {}, undefined, 0)).toThrow(RangeError);
  });

  test("creates, completes, and propagates immutable records", () => {
    const signal = new AbortController().signal;
    const record = Effect.runSync(
      createStandaloneRecordEffect(
        "orders.get",
        "direct",
        { correlationId: "correlation-1" },
        "trace-1",
        200,
        100,
        ids,
      ),
    );
    expect(record).toMatchObject({
      id: "invocation-1",
      functionId: "orders.get",
      status: "started",
      correlationId: "correlation-1",
      deadline: new Date(200).toISOString(),
    });
    expect(Object.isFrozen(record)).toBe(true);
    expect(
      createStandaloneRecord("orders.get", "direct", {}, "trace-1", undefined, 100, ids).id,
    ).toBe(record.id);
    const parent = Effect.runSync(standaloneParentEffect(record, signal, 200));
    expect(parent).toMatchObject({
      id: record.id,
      traceId: record.traceId,
      correlationId: "correlation-1",
      deadlineMs: 200,
      signal,
    });
    expect(standaloneParent(record, signal, undefined).deadlineMs).toBeUndefined();
    const complete = Effect.runSync(completeStandaloneRecordEffect(record, "success", 150));
    expect(complete).toMatchObject({ status: "success", durationMs: 50 });
    expect(completeStandaloneRecord(record, "success", 150)).toEqual(complete);
  });

  test("tags timestamp and ID source failures and keeps adapter errors", () => {
    const invalid = Effect.runSync(
      Effect.catchTag(
        createStandaloneRecordEffect("task", "direct", {}, "trace", undefined, NaN, ids),
        "StandaloneRecordError",
        (e) => Effect.succeed(e),
      ),
    );
    expect(invalid).toBeInstanceOf(StandaloneRecordError);
    expect(() =>
      createStandaloneRecord("task", "direct", {}, "trace", undefined, NaN, ids),
    ).toThrow(RangeError);
    const cause = new Error("id source offline");
    const broken = {
      next: (): import("@relkit/contracts").ProtocolId => {
        throw cause;
      },
    };
    const failure = Effect.runSync(
      Effect.catchTag(
        createStandaloneRecordEffect("task", "direct", {}, "trace", undefined, 0, broken),
        "StandaloneIdSourceFailure",
        (e) => Effect.succeed(e),
      ),
    );
    expect(failure).toBeInstanceOf(StandaloneIdSourceFailure);
    expect(failure.cause).toBe(cause);
    expect(() =>
      createStandaloneRecord("task", "direct", {}, "trace", undefined, 0, broken),
    ).toThrow(cause);
  });

  test("supports deterministic telemetry substitution", () => {
    const seen: InvocationOperation[] = [];
    const layer = Layer.succeed(InvocationTelemetry, {
      observe: <A, E, R>(operation: InvocationOperation, effect: Effect.Effect<A, E, R>) => {
        seen.push(operation);
        return effect;
      },
    });
    const program = Effect.gen(function* () {
      yield* calculateStandaloneDeadlineEffect(1, {}, undefined, 0);
      const record = yield* createStandaloneRecordEffect(
        "task",
        "direct",
        {},
        "trace",
        undefined,
        0,
        ids,
      );
      yield* standaloneParentEffect(record, new AbortController().signal, undefined);
      yield* completeStandaloneRecordEffect(record, "success", 1);
    });
    Effect.runSync(Effect.provide(program, layer));
    expect(seen).toEqual([
      "standalone.deadline",
      "standalone.record-create",
      "standalone.parent",
      "standalone.record-complete",
    ]);
  });
});
