import { Effect, Metric, Tracer } from "effect";
import { expect, test } from "vitest";
import {
  GraphInterruptedError,
  graphWaitingResponse,
  graphWaitingResponseEffect,
  isGraphInterruptedError,
  isGraphInterruptedErrorEffect,
  publicWaitingRequests,
  publicWaitingRequestsEffect,
} from "../src/graph-interruption.ts";

test("waiting responses preserve one or many request shapes", () => {
  const first = { id: "private", node: "review", value: { question: "Continue?" }, response: true };
  const second = { node: "confirm", response: { type: "string" } };
  expect(Effect.runSync(graphWaitingResponseEffect([first]))).toBe(true);
  expect(graphWaitingResponse([first, second])).toEqual({
    type: "array",
    prefixItems: [true, { type: "string" }],
    items: false,
    minItems: 2,
    maxItems: 2,
  });
  expect(Effect.runSync(publicWaitingRequestsEffect([first, second]))).toEqual([
    { node: "review", value: { question: "Continue?" }, response: true },
    { node: "confirm", response: { type: "string" } },
  ]);
  expect(publicWaitingRequests([first])).toEqual([
    { node: "review", value: { question: "Continue?" }, response: true },
  ]);
});

test("empty waiting responses fail by tag while synchronous callers receive TypeError", () => {
  const result = Effect.runSync(
    Effect.gen(function* () {
      const before = yield* Metric.snapshot;
      const error = yield* Effect.flip(graphWaitingResponseEffect([]));
      const after = yield* Metric.snapshot;
      return { before, after, error };
    }),
  );
  expect(result.error).toMatchObject({
    _tag: "GraphWaitingResponseError",
    message: "Graph interruption has no pending requests",
  });
  expect(() => graphWaitingResponse([])).toThrow(TypeError);
  expect(metricCount(result.after, "relkit.agents.graph_interruption.response.failure.total")).toBe(
    metricCount(result.before, "relkit.agents.graph_interruption.response.failure.total") + 1,
  );
});

test("recognizes internal interruption errors and emits named spans", () => {
  const spans: Tracer.NativeSpan[] = [];
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  const error = new GraphInterruptedError("thread-1", []);
  const recognized = Effect.runSync(
    Effect.withTracer(isGraphInterruptedErrorEffect(error), tracer),
  );
  expect(recognized).toBe(true);
  expect(isGraphInterruptedError(error)).toBe(true);
  expect(isGraphInterruptedError(new Error("other"))).toBe(false);
  expect(spans.map(({ name }) => name)).toEqual(["Agents.graphInterruption.isError"]);
});

function metricCount(snapshot: Metric.Snapshot[], name: string): number {
  const state = snapshot.find((metric) => metric.id === name)?.state;
  return state !== undefined && "count" in state && typeof state.count === "number"
    ? state.count
    : 0;
}
