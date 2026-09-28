import { expect, test } from "vitest";
import { Effect, Metric, Tracer } from "effect";
import { z } from "@relkit/schema";
import {
  assertAgentSchema,
  assertAgentSchemaEffect,
  isAgentSchema,
  isAgentSchemaEffect,
  isPositiveInteger,
  isPositiveIntegerEffect,
  isRecord,
  isRecordEffect,
  positiveInteger,
  positiveIntegerEffect,
} from "../src/agent-validation.ts";

test("validates authoring values through Effect and synchronous adapters", () => {
  const schema = z.string();
  expect(Effect.runSync(assertAgentSchemaEffect(schema, "input"))).toBe(schema);
  expect(Effect.runSync(isAgentSchemaEffect(schema))).toBe(true);
  expect(Effect.runSync(isPositiveIntegerEffect(2))).toBe(true);
  expect(Effect.runSync(isRecordEffect({ id: "one" }))).toBe(true);
  expect(Effect.runSync(positiveIntegerEffect(2, "limit"))).toBe(2);
  assertAgentSchema(schema, "input");
  expect(isAgentSchema(schema)).toBe(true);
  expect(isPositiveInteger(2)).toBe(true);
  expect(isRecord({ id: "one" })).toBe(true);
  expect(positiveInteger(2, "limit")).toBe(2);
});

test("exposes tagged Effect failures and preserves TypeError adapters", () => {
  const result = Effect.runSync(
    Effect.gen(function* () {
      const before = yield* Metric.snapshot;
      const schema = yield* Effect.flip(assertAgentSchemaEffect({}, "input"));
      const number = yield* Effect.flip(positiveIntegerEffect(0, "limit"));
      const after = yield* Metric.snapshot;
      return { schema, number, before, after };
    }),
  );
  expect(result.schema).toMatchObject({
    _tag: "AgentValidationError",
    operation: "assertAgentSchema",
    message: "Agent input must be a Standard Schema v1 validator",
  });
  expect(result.number).toMatchObject({
    _tag: "AgentValidationError",
    operation: "positiveInteger",
    message: "limit must be a finite positive integer",
  });
  expect(metricCount(result.after, "relkit.agents.validation.failure.total")).toBe(
    metricCount(result.before, "relkit.agents.validation.failure.total") + 2,
  );
  expect(() => assertAgentSchema({}, "input")).toThrow(TypeError);
  expect(() => positiveInteger(0, "limit")).toThrow(TypeError);
  expect(isAgentSchema({})).toBe(false);
  expect(isPositiveInteger(Number.POSITIVE_INFINITY)).toBe(false);
  expect(isRecord([])).toBe(false);
});

test("names validation spans on success and failure", () => {
  const spans: Tracer.NativeSpan[] = [];
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  Effect.runSync(Effect.withTracer(assertAgentSchemaEffect(z.string(), "input"), tracer));
  Effect.runSync(Effect.withTracer(Effect.flip(positiveIntegerEffect(0, "limit")), tracer));
  expect(spans.map((span) => span.name)).toEqual([
    "Agents.validation.assertSchema",
    "Agents.validation.positiveInteger",
  ]);
  expect(spans.every((span) => span.status._tag === "Ended")).toBe(true);
});

function metricCount(snapshot: Metric.Snapshot[], name: string): number {
  const state = snapshot.find((metric) => metric.id === name)?.state;
  return state !== undefined && "count" in state && typeof state.count === "number"
    ? state.count
    : 0;
}
