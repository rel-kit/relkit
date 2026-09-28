import { afterEach, expect, test } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FilesystemBackend } from "deepagents";
import { createBucketClient, defineBucket, type BucketProvider } from "@relkit/buckets";
import { z } from "@relkit/schema";
import { createThreadBucketBackend } from "../src/deepagent-bucket-scope.ts";
import { defineAgent, invokeAgent } from "../src/index.ts";
import { createTestModel } from "./test-model.ts";

const limits = { maxSteps: 8, maxToolCalls: 8, timeoutMs: 2_000 };
const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true }))));

test("loads memory and skills through native and RELKIT backends", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-deep-resources-"));
  roots.push(root);
  await mkdir(join(root, "skills", "native-orders"), { recursive: true });
  await writeFile(join(root, "AGENTS.md"), "Remember NATIVE-MEMORY.");
  await writeFile(join(root, "skills", "native-orders", "SKILL.md"), skill("native-orders"));
  const native = createTestModel([{ type: "final", output: { answer: "native" } }]);
  await runResourceAgent(
    "native.resources",
    native.model,
    new FilesystemBackend({
      rootDir: root,
      virtualMode: true,
    }),
    "native:resources",
  );
  expect(JSON.stringify(native.calls[0])).toMatch(/NATIVE-MEMORY|native-orders/);

  const bucket = createBucketClient({
    ownerId: "agent",
    bucketId: "workspace",
    source: memoryBucketProvider(),
  });
  const scoped = createThreadBucketBackend(bucket, "relkit.resources", "relkit:resources");
  await scoped.write("/AGENTS.md", "Remember RELKIT-MEMORY.");
  await scoped.write("/skills/relkit-orders/SKILL.md", skill("relkit-orders"));
  const relkit = createTestModel([{ type: "final", output: { answer: "relkit" } }]);
  await runResourceAgent(
    "relkit.resources",
    relkit.model,
    defineBucket({ id: "workspace", visibility: "private" }),
    "relkit:resources",
    bucket,
  );
  expect(JSON.stringify(relkit.calls[0])).toMatch(/RELKIT-MEMORY|relkit-orders/);
});

async function runResourceAgent(
  id: string,
  model: ReturnType<typeof createTestModel>["model"],
  backend: object,
  threadId: string,
  bucketBackend?: ReturnType<typeof createBucketClient>,
) {
  return invokeAgent({
    agent: defineAgent({
      id,
      input: z.object({ message: z.string() }),
      output: z.object({ answer: z.string() }),
      model,
      instructions: "Use loaded resources.",
      tools: [],
      backend,
      memory: ["/AGENTS.md"],
      skills: ["/skills/"],
      limits,
    }),
    input: { message: "go" },
    threadId,
    ...(bucketBackend === undefined ? {} : { bucketBackend }),
    tools: [],
    engine: { invoke: () => Promise.reject(new Error("unused")) },
  });
}

function skill(name: string) {
  return `---\nname: ${name}\ndescription: Handles orders.\n---\n# ${name}\n`;
}

function memoryBucketProvider(): BucketProvider {
  const objects = new Map<string, Uint8Array>();
  return {
    put: async (key, bytes) => void objects.set(key, bytes.slice()),
    get: async (key) => objects.get(key)?.slice(),
    head: async (key) =>
      objects.has(key) ? { etag: key, size: objects.get(key)!.byteLength } : undefined,
    delete: async (key) => void objects.delete(key),
    exists: async (key) => objects.has(key),
    list: async (prefix) =>
      [...objects.keys()].filter((key) => prefix === undefined || key.startsWith(prefix)).sort(),
  };
}
