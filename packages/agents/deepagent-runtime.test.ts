import { describe, expect, test } from "bun:test";
import { InMemoryStore, MemorySaver } from "@langchain/langgraph";
import { createBucketClient, defineBucket, type BucketProvider } from "@relkit/buckets";
import { z } from "@relkit/schema";
import { defineAgent, defineCheckpointerDb, defineMemoryDb, invokeAgent } from "./src/index.ts";
import { hasDeepAgentCapabilities } from "./src/define-agent-deep.ts";
import { createTestModel } from "./test-model.ts";

const limits = { maxSteps: 8, maxToolCalls: 8, timeoutMs: 2_000 };

function specialist(model?: ReturnType<typeof createTestModel>["model"]) {
  return defineAgent({
    id: "researcher",
    description: "Research delegated questions.",
    input: z.object({ message: z.string() }),
    output: z.object({ answer: z.string() }),
    ...(model === undefined ? {} : { model }),
    instructions: "You are the child specialist.",
    tools: [],
    limits,
  });
}

function deepAgent(
  model: ReturnType<typeof createTestModel>["model"],
  child = specialist(),
  persistence: Record<string, unknown> = {},
) {
  return defineAgent({
    id: "assistant",
    input: z.object({ message: z.string() }),
    output: z.object({ answer: z.string() }),
    model,
    instructions: "You are the parent assistant.",
    tools: [],
    subagents: [child],
    ...persistence,
    limits,
  });
}

function runtime(agent: ReturnType<typeof deepAgent>, threadId: string) {
  return invokeAgent({
    agent,
    input: { message: "Delegate this." },
    threadId,
    tools: [],
    engine: { invoke: () => Promise.reject(new Error("unexpected RELKIT tool")) },
  });
}

describe("native DeepAgents runtime selection", () => {
  test("selects deep execution and inherits the parent model", async () => {
    const shared = createTestModel([
      {
        type: "tool-call",
        callId: "task-1",
        toolId: "task",
        native: true,
        input: { description: "Answer the question.", subagent_type: "researcher" },
      },
      { type: "final", output: { answer: "child result" } },
      { type: "final", output: { answer: "parent result" } },
    ]);

    await expect(runtime(deepAgent(shared.model), "deep:inherit")).resolves.toEqual({
      answer: "parent result",
    });
    expect(shared.calls).toHaveLength(3);
    expect(JSON.stringify(shared.calls[1])).toContain("You are the child specialist.");
  });

  test("uses an explicit subagent model override", async () => {
    const parent = createTestModel([
      {
        type: "tool-call",
        callId: "task-2",
        toolId: "task",
        native: true,
        input: { description: "Answer the question.", subagent_type: "researcher" },
      },
      { type: "final", output: { answer: "parent result" } },
    ]);
    const child = createTestModel([{ type: "final", output: { answer: "child result" } }]);

    await expect(
      runtime(deepAgent(parent.model, specialist(child.model)), "deep:override"),
    ).resolves.toEqual({ answer: "parent result" });
    expect(parent.calls).toHaveLength(2);
    expect(child.calls).toHaveLength(1);
  });

  test("resolves native checkpoint and memory resources", async () => {
    const model = createTestModel([{ type: "final", output: { answer: "persisted" } }]);
    const saver = new MemorySaver();
    const store = new InMemoryStore();
    const checkpointer = defineCheckpointerDb({ id: "deep-checkpoints", client: saver });
    const memory = defineMemoryDb({ id: "deep-memory", client: store });

    await expect(
      runtime(deepAgent(model.model, specialist(), { checkpointer, store: memory }), "deep:saved"),
    ).resolves.toEqual({ answer: "persisted" });
    await expect(
      saver.getTuple({ configurable: { thread_id: "deep:saved" } }),
    ).resolves.toBeDefined();
  });

  test("binds a RELKIT bucket as a thread-scoped native backend", async () => {
    const objects = new Map<string, Uint8Array>();
    const bucket = createBucketClient({
      ownerId: "assistant",
      bucketId: "workspace",
      source: memoryBucketProvider(objects),
    });
    const model = createTestModel([
      {
        type: "tool-call",
        callId: "write-1",
        toolId: "write_file",
        native: true,
        input: { file_path: "/notes.md", content: "private" },
      },
      { type: "final", output: { answer: "saved" } },
    ]);
    const agent = defineAgent({
      id: "bucket.agent",
      input: z.object({ message: z.string() }),
      output: z.object({ answer: z.string() }),
      model: model.model,
      instructions: "Save the note.",
      tools: [],
      backend: defineBucket({ id: "workspace", visibility: "private" }),
      limits,
    });

    await expect(
      invokeAgent({
        agent,
        input: { message: "save" },
        threadId: "customer/../42",
        bucketBackend: bucket,
        tools: [],
        engine: { invoke: () => Promise.reject(new Error("unexpected RELKIT tool")) },
      }),
    ).resolves.toEqual({ answer: "saved" });
    expect([...objects.keys()]).toHaveLength(1);
    expect([...objects.keys()][0]).toEndWith("/notes.md");
    expect([...objects.keys()][0]).not.toContain("customer");
  });

  test("recognizes and validates every deep capability", () => {
    const model = createTestModel([]).model;
    const child = specialist();
    const base = {
      id: "deep.capability",
      input: z.string(),
      output: z.string(),
      model,
      instructions: "Use native DeepAgents.",
      tools: [],
      limits,
    } as const;
    for (const capability of [
      { subagents: [child] },
      { skills: [] },
      { memory: [] },
      { backend: {} },
    ]) {
      expect(hasDeepAgentCapabilities(defineAgent({ ...base, ...capability }))).toBe(true);
    }
    expect(() => defineAgent({ ...base, skills: ["/skills", "/skills"] })).toThrow("unique");
    expect(() => defineAgent({ ...base, subagents: [child, child] })).toThrow("Duplicate");
  });
});

function memoryBucketProvider(objects: Map<string, Uint8Array>): BucketProvider {
  return {
    put: async (key, bytes) => void objects.set(key, bytes.slice()),
    get: async (key) => objects.get(key)?.slice(),
    head: async (key) => {
      const bytes = objects.get(key);
      return bytes === undefined ? undefined : { etag: key, size: bytes.byteLength };
    },
    delete: async (key) => void objects.delete(key),
    exists: async (key) => objects.has(key),
    list: async (prefix) =>
      [...objects.keys()].filter((key) => prefix === undefined || key.startsWith(prefix)).sort(),
  };
}
