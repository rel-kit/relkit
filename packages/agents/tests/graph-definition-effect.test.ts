import { END, START, StateSchema } from "@langchain/langgraph";
import { z } from "@relkit/schema";
import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import { defineGraphNode } from "../src/define-graph-node.js";
import { prepareGraphDefinition, prepareGraphDefinitionEffect } from "../src/graph-definition.js";

const state = new StateSchema({ value: z.string(), result: z.string().optional() });
const input = z.object({ value: z.string() });
const output = z.object({ result: z.string() });
const node = defineGraphNode({ id: "step", input, output, handler: ({ value }) => ({ result: value }) });
const edges = (builder: import("../src/graph-edges.js").GraphEdgeBuilder<string, any>) =>
  builder.addEdge(START, "step").addEdge("step", END);

test("graph definition Effect prepares the same ordered topology as its adapter", () => {
  const prepared = Effect.runSync(prepareGraphDefinitionEffect(state, input, output, [node], edges));
  expect(prepared.operations).toEqual(prepareGraphDefinition(state, input, output, [node], edges).operations);
  expect(prepared.stateKeys).toEqual(new Set(["value", "result"]));
});

test("graph definition Effect tags invalid nodes", () => {
  const failure = Effect.runSync(Effect.result(
    prepareGraphDefinitionEffect(state, input, output, [node, node], edges),
  ));
  expect(Result.isFailure(failure)).toBe(true);
  if (Result.isFailure(failure)) expect(failure.failure._tag).toBe("GraphDefinitionFailure");
});
