import { END, START, StateSchema } from "@langchain/langgraph";
import { IdentityStore } from "@relkit/invocation";
import { z } from "@relkit/schema";
import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import {
  defineGraphEffect,
  graphExecutionEffect,
  isGraphDescriptorEffect,
} from "../src/define-graph.js";
import { defineGraphNode } from "../src/define-graph-node.js";
import type { GraphEdgeBuilder } from "../src/graph-edges.js";

const node = defineGraphNode({
  id: "respond",
  input: z.object({ question: z.string() }),
  output: z.object({ answer: z.string() }),
  handler: ({ question }) => ({ answer: question }),
});
const options = {
  state: new StateSchema({ question: z.string(), answer: z.string().optional() }),
  input: z.object({ question: z.string() }),
  output: z.object({ answer: z.string() }),
  nodes: [node] as const,
  edges: (edge: GraphEdgeBuilder<"respond", unknown>) =>
    edge.addEdge(START, "respond").addEdge("respond", END),
  limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 1000 },
};

test("graph definition Effect uses substituted identity and exposes execution state", () => {
  const store = {
    canonical: new WeakMap(),
    unbound: new WeakMap(),
    services: new WeakMap(),
    nextUnboundId: () => "fixed",
  };
  const graph = Effect.runSync(
    Effect.provideService(defineGraphEffect(options), IdentityStore, store),
  );
  expect(graph.id).toBe("unbound.fixed");
  expect(Effect.runSync(isGraphDescriptorEffect(graph))).toBe(true);
  expect(Effect.runSync(graphExecutionEffect(graph)).state).toBe(options.state);
});

test("graph definition Effect tags invalid graph options", () => {
  const result = Effect.runSync(
    Effect.result(defineGraphEffect({ ...options, nodes: [] as never })),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure._tag).toBe("GraphDefinitionFailure");
});
