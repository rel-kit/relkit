import { END, MemorySaver, START, StateSchema } from "@langchain/langgraph";
import { z } from "@relkit/schema";
import { Effect, Layer } from "effect";
import { expect, test } from "vitest";
import { defineGraph } from "../src/define-graph.js";
import { defineGraphNode } from "../src/define-graph-node.js";
import { defineCheckpointerDb } from "../src/define-persistence.js";
import { GraphInvocationIdentity, invokeGraphEffect } from "../src/graph-runtime.js";

test("interrupting graph Effect rolls back a late persistence acquisition", async () => {
  let finishFactory = (_value: MemorySaver) => {};
  const factory = new Promise<MemorySaver>((resolve) => {
    finishFactory = resolve;
  });
  let markStarted = () => {};
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  let markDisposed = () => {};
  const disposed = new Promise<void>((resolve) => {
    markDisposed = resolve;
  });
  const checkpointer = defineCheckpointerDb({
    id: "graph.interrupted.persistence",
    client: () => {
      markStarted();
      return factory;
    },
    dispose: () => {
      markDisposed();
    },
  });
  const node = defineGraphNode({
    id: "respond",
    input: z.object({ question: z.string() }),
    output: z.object({ answer: z.string() }),
    handler: ({ question }) => ({ answer: question }),
  });
  const graph = defineGraph({
    id: "graph.interrupted",
    state: new StateSchema({ question: z.string(), answer: z.string().optional() }),
    input: z.object({ question: z.string() }),
    output: z.object({ answer: z.string() }),
    nodes: [node],
    edges: (edge) => edge.addEdge(START, "respond").addEdge("respond", END),
    checkpointer,
    limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 10_000 },
  });
  const identity = Layer.succeed(GraphInvocationIdentity, { randomUUID: () => "fixed" });
  const controller = new AbortController();
  const pending = Effect.runPromise(
    Effect.provide(
      invokeGraphEffect({
        agent: graph,
        input: { question: "Hi" },
        threadId: "thread",
        tools: {},
        engine: { invoke: async () => undefined },
      }),
      identity,
    ),
    { signal: controller.signal },
  );
  await started;
  controller.abort();
  finishFactory(new MemorySaver());
  await expect(pending).rejects.toThrow();
  await disposed;
});
