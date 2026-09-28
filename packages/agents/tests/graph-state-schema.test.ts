import { StateSchema } from "@langchain/langgraph";
import { z, type StandardSchemaV1 } from "@relkit/schema";
import { Effect, Metric, Tracer } from "effect";
import { expect, test } from "vitest";
import { selectGraphState, selectGraphStateEffect } from "../src/graph-state-schema.ts";
import { AgentRuntimeError } from "../src/runtime-errors.ts";

test("selects graph fields through Effect and its synchronous adapter", () => {
  const state = new StateSchema({ question: z.string(), answer: z.string() });
  const selection = z.object({ answer: z.string() });
  const projected = Effect.runSync(selectGraphStateEffect(state, selection));
  expect(Object.keys(projected.fields)).toEqual(["answer"]);
  expect(Object.keys(selectGraphState(state, selection).fields)).toEqual(["answer"]);
  expect(Object.keys(selectGraphState(state, z.object({})).fields)).toEqual([]);
});

test("reports unavailable selection and fields as tagged failures", () => {
  const state = new StateSchema({ answer: z.string() });
  const result = Effect.runSync(
    Effect.gen(function* () {
      const before = yield* Metric.snapshot;
      const unavailable = yield* Effect.flip(selectGraphStateEffect(state, z.string()));
      const missing = yield* Effect.flip(
        selectGraphStateEffect(state, z.object({ other: z.string() })),
      );
      const after = yield* Metric.snapshot;
      return { before, after, unavailable, missing };
    }),
  );
  expect(result.unavailable).toMatchObject({
    _tag: "GraphStateSelectionError",
    code: "RELKIT_SCHEMA_UNAVAILABLE",
    message: "Graph state selection is unavailable",
  });
  expect(result.missing).toMatchObject({
    _tag: "GraphStateSelectionError",
    code: "RELKIT_SCHEMA_UNAVAILABLE",
    message: 'Graph state field "other" is unavailable',
  });
  const unprojectable = {
    "~standard": { version: 1, vendor: "fixture", validate: (value: unknown) => ({ value }) },
  } satisfies StandardSchemaV1;
  expect(Effect.runSync(Effect.flip(selectGraphStateEffect(state, unprojectable)))).toMatchObject({
    _tag: "GraphStateSelectionError",
    message: "Graph state selection is unavailable",
  });
  expect(() => selectGraphState(state, z.string())).toThrow(AgentRuntimeError);
  expect(() => selectGraphState(state, z.object({ other: z.string() }))).toThrow(
    'Graph state field "other" is unavailable',
  );
  expect(metricCount(result.after, "relkit.agents.graph_state.selection.failure.total")).toBe(
    metricCount(result.before, "relkit.agents.graph_state.selection.failure.total") + 2,
  );
});

test("selection emits a named span", () => {
  const spans: Tracer.NativeSpan[] = [];
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  const state = new StateSchema({ answer: z.string() });
  Effect.runSync(
    Effect.withTracer(selectGraphStateEffect(state, z.object({ answer: z.string() })), tracer),
  );
  expect(spans.map(({ name }) => name)).toEqual(["Agents.graphState.select"]);
});

function metricCount(snapshot: Metric.Snapshot[], name: string): number {
  const state = snapshot.find((metric) => metric.id === name)?.state;
  return state !== undefined && "count" in state && typeof state.count === "number"
    ? state.count
    : 0;
}
