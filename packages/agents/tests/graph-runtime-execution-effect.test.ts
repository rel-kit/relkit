import { END, START, StateSchema } from "@langchain/langgraph";
import { z } from "@relkit/schema";
import { Effect } from "effect";
import { expect, test } from "vitest";
import { defineGraph } from "../src/define-graph.js";
import { defineGraphNode } from "../src/define-graph-node.js";
import { runCompiledGraph, runCompiledGraphEffect } from "../src/graph-runtime-execution.js";

const node = defineGraphNode({
  id: "reply",
  input: z.object({ question: z.string() }),
  output: z.object({ answer: z.string() }),
  handler: ({ question }) => ({ answer: question }),
});
const graph = defineGraph({
  id: "effect.run.compiled",
  state: new StateSchema({ question: z.string(), answer: z.string().optional() }),
  input: z.object({ question: z.string() }),
  output: z.object({ answer: z.string() }),
  nodes: [node],
  edges: (edge) => edge.addEdge(START, "reply").addEdge("reply", END),
  limits: { maxSteps: 3, maxToolCalls: 1, timeoutMs: 1_000 },
});
const options = {
  agent: graph,
  tools: {},
  engine: {
    invoke: async () => {
      throw new Error("unexpected tool");
    },
  },
} as never;

test("compiled graph Effect and Promise adapter preserve output", async () => {
  const signal = new AbortController().signal;
  const input = { question: "Hello" };
  expect(
    await Effect.runPromise(
      runCompiledGraphEffect(options, input, signal, "run-1", "trace-1", 1024),
    ),
  ).toEqual({ answer: "Hello" });
  expect(await runCompiledGraph(options, input, signal, "run-2", "trace-2", 1024)).toEqual({
    answer: "Hello",
  });
});
