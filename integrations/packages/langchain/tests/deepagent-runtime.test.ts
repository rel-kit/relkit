/** Exercises native deepagent runtime behavior through the integration owner, preserving the original assertions and scoped test fixtures. */

import { describe, expect, test } from "vitest";
import { InMemoryStore, MemorySaver } from "@langchain/langgraph";
import { createBucketClient, defineBucket, type BucketProvider } from "@relkit/buckets";
import { z } from "@relkit/schema";
import { defineAgent, defineCheckpointerDb, defineMemoryDb, invokeAgent } from "../src/index.ts";
import { hasDeepAgentCapabilities } from "../src/define-agent-deep.ts";
import { createTestModel } from "./test-model.ts";
import {
  limits,
  specialist,
  deepAgent,
  runtime,
  memoryBucketProvider,
} from "./deepagent-runtime.fixture.js";

describe("native DeepAgents runtime selection", () => {
  test(
    "selects deep execution and inherits the parent model",
    caseSelectsDeepExecutionAndInheritsTheParent,
  );

  test("uses an explicit subagent model override", caseUsesAnExplicitSubagentModelOverride);

  test(
    "resolves native checkpoint and memory resources",
    caseResolvesNativeCheckpointAndMemoryResources,
  );

  test("binds a RELKIT bucket as a thread-scoped native backend", caseBindsARELKITBucketAsAThread);

  test(
    "recognizes and validates every deep capability",
    caseRecognizesAndValidatesEveryDeepCapability,
  );
});

/** Verifies that selects deep execution and inherits the parent model.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseSelectsDeepExecutionAndInheritsTheParent() {
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
}

/** Verifies that uses an explicit subagent model override.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseUsesAnExplicitSubagentModelOverride() {
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
}

/** Verifies that resolves native checkpoint and memory resources.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseResolvesNativeCheckpointAndMemoryResources() {
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
}

/** Verifies that binds a RELKIT bucket as a thread-scoped native backend.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseBindsARELKITBucketAsAThread() {
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
  expect([...objects.keys()][0]?.endsWith("/notes.md")).toBe(true);
  expect([...objects.keys()][0]).not.toContain("customer");
}

/** Verifies that recognizes and validates every deep capability.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
function caseRecognizesAndValidatesEveryDeepCapability() {
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
}
