/** Creates isolated native deepagent runtime fixtures; each caller owns the returned model, state and provider observations. */

import { type BucketProvider } from "@relkit/buckets";
import { z } from "@relkit/schema";
import { defineAgent, invokeAgent } from "../src/index.ts";

import { createTestModel } from "./test-model.ts";

export const limits = { maxSteps: 8, maxToolCalls: 8, timeoutMs: 2_000 };

export function specialist(model?: ReturnType<typeof createTestModel>["model"]) {
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

export function deepAgent(
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

export function runtime(agent: ReturnType<typeof deepAgent>, threadId: string) {
  return invokeAgent({
    agent,
    input: { message: "Delegate this." },
    threadId,
    tools: [],
    engine: { invoke: () => Promise.reject(new Error("unexpected RELKIT tool")) },
  });
}

export function memoryBucketProvider(objects: Map<string, Uint8Array>): BucketProvider {
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
