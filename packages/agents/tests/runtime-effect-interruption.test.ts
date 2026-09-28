import { Effect, Layer } from "effect";
import { expect, test } from "vitest";
import { z } from "@relkit/schema";
import { END, START, StateSchema } from "@langchain/langgraph";
import { defineAgent } from "../src/define-agent.js";
import { defineGraph } from "../src/define-graph.js";
import { defineGraphNode } from "../src/define-graph-node.js";
import { invokeAgentEffect } from "../src/runtime.js";
import { AgentExecution } from "../src/runtime-service.js";

test("interrupting the exported invocation Effect aborts active model work", async () => {
  let markStarted = () => {};
  let markAborted = () => {};
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const aborted = new Promise<void>((resolve) => {
    markAborted = resolve;
  });
  const agent = defineAgent({
    id: "test.interrupt",
    input: z.object({ question: z.string() }),
    output: z.object({ answer: z.string() }),
    model: "test",
    instructions: "Answer questions.",
    tools: [],
    limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 10_000 },
  });
  const layer = Layer.succeed(AgentExecution, {
    resolveModel: async () => ({
      id: "test",
      model: "test",
      maxInputBytes: 1024,
      maxOutputBytes: 1024,
    }),
    runLoop: async (_options, _model, _modelId, signal) =>
      new Promise<never>((_resolve, reject) => {
        markStarted();
        const stop = () => {
          markAborted();
          reject(new Error("interrupted"));
        };
        if (signal.aborted) stop();
        else signal.addEventListener("abort", stop, { once: true });
      }),
    invokeGraph: async () => undefined,
    randomUUID: () => "test-id",
  });
  const controller = new AbortController();
  const pending = Effect.runPromise(
    Effect.provide(
      invokeAgentEffect({
        agent,
        input: { question: "Hi" },
        tools: {},
        engine: { invoke: async () => undefined },
      }),
      layer,
    ),
    { signal: controller.signal },
  );

  await started;
  controller.abort();
  await expect(pending).rejects.toThrow();
  await aborted;
});

test("interrupting a graph invocation Effect aborts the supplied graph service", async () => {
  const node = defineGraphNode({
    id: "respond",
    input: z.object({ question: z.string() }),
    output: z.object({ answer: z.string() }),
    handler: ({ question }) => ({ answer: question }),
  });
  const graph = defineGraph({
    id: "interrupt.graph",
    state: new StateSchema({ question: z.string(), answer: z.string().optional() }),
    input: z.object({ question: z.string() }),
    output: z.object({ answer: z.string() }),
    nodes: [node],
    edges: (edge) => edge.addEdge(START, "respond").addEdge("respond", END),
    limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 10_000 },
  });
  let markStarted = () => {};
  let markAborted = () => {};
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const aborted = new Promise<void>((resolve) => {
    markAborted = resolve;
  });
  const layer = Layer.succeed(AgentExecution, {
    resolveModel: async () => {
      throw new Error("unexpected model resolution");
    },
    runLoop: async () => {
      throw new Error("unexpected loop");
    },
    invokeGraph: async (options) =>
      new Promise<never>((_resolve, reject) => {
        markStarted();
        const stop = () => {
          markAborted();
          reject(new Error("interrupted"));
        };
        if (options.signal?.aborted) stop();
        else options.signal?.addEventListener("abort", stop, { once: true });
      }),
    randomUUID: () => "test-id",
  });
  const controller = new AbortController();
  const pending = Effect.runPromise(
    Effect.provide(
      invokeAgentEffect({
        agent: graph,
        input: { question: "Hi" },
        tools: {},
        engine: { invoke: async () => undefined },
      }),
      layer,
    ),
    { signal: controller.signal },
  );
  await started;
  controller.abort();
  await expect(pending).rejects.toThrow();
  await aborted;
});
