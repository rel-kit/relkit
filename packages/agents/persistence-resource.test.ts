import { describe, expect, test } from "bun:test";
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
} from "./src/index.js";

describe("agent persistence resources", () => {
  test("lazily creates and disposes an owned checkpointer once", async () => {
    let creates = 0;
    let disposes = 0;
    const resource = defineCheckpointerDb({
      id: "ai.checkpoints",
      client: ({ env }) => {
        expect(env.DATABASE_URL).toBe("fixture://checkpoints");
        creates += 1;
        return new MemorySaver();
      },
      dispose: () => {
        disposes += 1;
      },
    });

    expect(isPersistenceResource(resource)).toBe(true);
    expect(creates).toBe(0);
    const context = { env: { DATABASE_URL: "fixture://checkpoints" } };
    const [first, second] = await Promise.all([
      resource.acquire(context),
      resource.acquire(context),
    ]);
    expect(first).toBe(second);
    expect(creates).toBe(1);
    await resource.release();
    await resource.release();
    expect(disposes).toBe(1);
    await expect(resource.acquire(context)).rejects.toThrow(
      'checkpointer resource "ai.checkpoints" is released',
    );
  });

  test("never disposes a borrowed native memory store", async () => {
    const store = new InMemoryStore();
    let disposes = 0;
    const resource = defineMemoryDb({
      id: "ai.memory",
      client: store,
      dispose: () => {
        disposes += 1;
      },
    });

    expect(resource.ownership).toBe("borrowed");
    expect(await resource.acquire({ env: {} })).toBe(store);
    await resource.release();
    expect(disposes).toBe(0);
    expect(JSON.parse(JSON.stringify(resource))).toEqual({
      kind: "agent-persistence",
      resource: "memory",
      id: "ai.memory",
      ownership: "borrowed",
    });
  });

  test("requires explicit disposal when ownership is transferred", () => {
    expect(() =>
      defineCheckpointerDb({
        id: "owned.checkpoints",
        client: new MemorySaver(),
        ownership: "owned",
      }),
    ).toThrow("Owned checkpointer resource requires dispose");
  });

  test("acquires graph persistence only when execution starts", async () => {
    let creates = 0;
    let disposes = 0;
    const checkpointer = defineCheckpointerDb({
      id: "lazy.graph.checkpoints",
      client: () => {
        creates += 1;
        return new MemorySaver();
      },
      dispose: () => {
        disposes += 1;
      },
    });
    const state = new StateSchema({ value: z.string(), answer: z.string().optional() });
    const node = defineGraphNode({
      id: "run",
      input: z.object({ value: z.string() }),
      output: z.object({ answer: z.string() }),
      handler: ({ value }) => ({ answer: value }),
    });
    const graph = defineGraph({
      id: "lazy-persistence",
      state,
      input: z.object({ value: z.string() }),
      output: z.object({ answer: z.string() }),
      nodes: [node],
      edges: (edge) => edge.addEdge(START, "run").addEdge("run", END),
      checkpointer,
      limits: { maxSteps: 3, maxToolCalls: 1, timeoutMs: 1_000 },
    });

    expect(creates).toBe(0);
    await expect(
      invokeAgent({
        agent: graph,
        input: { value: "ok" },
        threadId: "user:order:1",
        tools: {},
        engine: { invoke: () => Promise.reject(new Error("unused")) },
      }),
    ).resolves.toEqual({ answer: "ok" });
    expect(creates).toBe(1);
    await releaseAgentPersistence([graph]);
    expect(disposes).toBe(1);
  });

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
