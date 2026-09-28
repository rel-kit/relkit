import { describe, expect, test } from "vitest";
import { END, START, InMemoryStore, MemorySaver, StateSchema } from "@langchain/langgraph";
import { z } from "@relkit/schema";
import {
  defineCheckpointerDb,
  defineGraph,
  defineGraphNode,
  defineMemoryDb,
  invokeAgent,
  isPersistenceResource,
  releaseAgentPersistence,
} from "../src/index.js";

describe("agent persistence resources", () => {
  test("accepts native and custom protocols without invoking lifecycle setup", async () => {
    let setupCalls = 0;
    let startCalls = 0;
    class CustomSaver extends MemorySaver {
      setup() {
        setupCalls += 1;
      }
    }
    class CustomStore extends InMemoryStore {
      start() {
        startCalls += 1;
      }
    }
    const checkpointer = defineCheckpointerDb({
      id: "custom.checkpoints",
      client: new CustomSaver(),
    });
    const memory = defineMemoryDb({ id: "custom.memory", client: new CustomStore() });
    const state = new StateSchema({ value: z.string(), answer: z.string().optional() });
    const node = defineGraphNode({
      id: "run",
      input: z.object({ value: z.string() }),
      output: z.object({ answer: z.string() }),
      handler: ({ value }) => ({ answer: value }),
    });
    const graph = defineGraph({
      id: "custom-persistence",
      state,
      input: z.object({ value: z.string() }),
      output: z.object({ answer: z.string() }),
      nodes: [node],
      edges: (edge) => edge.addEdge(START, "run").addEdge("run", END),
      checkpointer,
      store: memory,
      limits: { maxSteps: 3, maxToolCalls: 1, timeoutMs: 1_000 },
    });

    await expect(
      invokeAgent({
        agent: graph,
        input: { value: "ok" },
        threadId: "custom:1",
        tools: {},
        engine: { invoke: () => Promise.reject(new Error("unused")) },
      }),
    ).resolves.toEqual({ answer: "ok" });
    expect(setupCalls).toBe(0);
    expect(startCalls).toBe(0);
  });

  test("rejects a factory result that is not protocol compatible", async () => {
    const resource = defineMemoryDb({
      id: "invalid.memory",
      client: () => ({}) as InMemoryStore,
      dispose: () => undefined,
    });
    const state = new StateSchema({ answer: z.string().optional() });
    const node = defineGraphNode({
      id: "run",
      input: z.object({}),
      output: z.object({ answer: z.string() }),
      handler: () => ({ answer: "unused" }),
    });
    const graph = defineGraph({
      id: "invalid-persistence",
      state,
      input: z.object({}),
      output: z.object({ answer: z.string() }),
      nodes: [node],
      edges: (edge) => edge.addEdge(START, "run").addEdge("run", END),
      store: resource,
      limits: { maxSteps: 3, maxToolCalls: 1, timeoutMs: 1_000 },
    });

    await expect(
      invokeAgent({
        agent: graph,
        input: {},
        tools: {},
        engine: { invoke: () => Promise.reject(new Error("unused")) },
      }),
    ).rejects.toThrow("memory resource does not implement the LangGraph protocol");
  });
});
