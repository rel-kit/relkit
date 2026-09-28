import { END, START, StateSchema } from "@langchain/langgraph";
import { z } from "@relkit/schema";
import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import { defineGraph } from "../src/define-graph.js";
import {
  defineGraphNode,
  defineGraphNodeEffect,
  isGraphNodeDescriptorEffect,
  runGraphNodeHandlerEffect,
} from "../src/define-graph-node.js";
import {
  createSubgraphNode,
  createSubgraphNodeEffect,
  isSubgraphNodeEffect,
  subgraphForNodeEffect,
} from "../src/graph-subgraph.js";

const input = z.object({ value: z.string() });
const output = z.object({ result: z.string() });
const options = {
  id: "step",
  input,
  output,
  handler: ({ value }: { value: string }) => ({ result: value }),
};

test("graph node Effect defines a descriptor and validates a handler result", async () => {
  const node = Effect.runSync(defineGraphNodeEffect(options));
  expect(Effect.runSync(isGraphNodeDescriptorEffect(node))).toBe(true);
  expect(await Effect.runPromise(runGraphNodeHandlerEffect(options, [], { value: "ok" }))).toEqual({
    result: "ok",
  });
  expect(await node.handler({ value: "ok" })).toEqual({ result: "ok" });
});

test("graph node Effect tags authoring and handler failures while adapters preserve errors", async () => {
  const invalid = { ...options, ends: [START] };
  const result = Effect.runSync(Effect.result(defineGraphNodeEffect(invalid)));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure._tag).toBe("GraphNodeValidationFailure");
  expect(() => defineGraphNode(invalid)).toThrow("Graph node ends cannot contain START");

  const failure = await Effect.runPromise(
    Effect.result(runGraphNodeHandlerEffect(options, [], {})),
  );
  expect(Result.isFailure(failure)).toBe(true);
  if (Result.isFailure(failure)) expect(failure.failure._tag).toBe("GraphNodeValidationFailure");
});

test("subgraph Effects preserve hidden graph identity and tag invalid destinations", () => {
  const node = defineGraphNode(options);
  const graph = defineGraph({
    id: "flow",
    state: new StateSchema({ value: z.string(), result: z.string().optional() }),
    input,
    output,
    nodes: [node],
    edges: (edge) => edge.addEdge(START, "step").addEdge("step", END),
    limits: { maxSteps: 2, maxToolCalls: 1, timeoutMs: 1000 },
  });
  const nested = Effect.runSync(createSubgraphNodeEffect(graph, { id: "nested" }));
  expect(Effect.runSync(isSubgraphNodeEffect(nested))).toBe(true);
  expect(Effect.runSync(subgraphForNodeEffect(nested))).toBe(graph);
  expect(createSubgraphNode(graph).id).toBe("flow");
  const invalid = Effect.runSync(Effect.result(createSubgraphNodeEffect(graph, { ends: [START] })));
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) expect(invalid.failure._tag).toBe("GraphNodeValidationFailure");
});
