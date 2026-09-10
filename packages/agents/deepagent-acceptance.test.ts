import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDeepAgent, FilesystemBackend } from "deepagents";
import { toolStrategy } from "langchain";
import { createBucketClient, defineBucket, type BucketProvider } from "@relkit/buckets";
import { z } from "@relkit/schema";
import type { AgentExecutionEvent } from "./src/index.ts";
import { createThreadBucketBackend } from "./src/deepagent-bucket-scope.ts";
import { defineAgent, invokeAgent } from "./src/index.ts";
import { createTestModel } from "./test-model.ts";
import { createNativeStringTool } from "./test-native-tool.ts";

const limits = { maxSteps: 8, maxToolCalls: 8, timeoutMs: 2_000 };
const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true }))));

test("recursively maps deep subagents with isolated scopes and native parity", async () => {
  const relkit = nestedFixture();
  const events: AgentExecutionEvent[] = [];
  const tools: string[] = [];
  const output = await invokeNested(relkit, events, tools);
  const direct = nestedFixture();
  const native = directNative(direct);
  const run = await native.streamEvents(
    { messages: [{ role: "user", content: JSON.stringify({ message: "root-private" }) }] },
    { version: "v3" },
  );
  for await (const _event of run) void _event;
  const nativeOutput = await run.output;

  expect(output).toEqual({ answer: "parent-result" });
  expect(nativeOutput).toMatchObject({ structuredResponse: { value: output } });
  expect(relkit.effects()).toBe(1);
  expect(direct.effects()).toBe(1);
  expect(tools).toContain("lookup:succeeded");
  expect(events.some(({ agent }) => agent === "manager")).toBe(true);
  expect(events.some(({ agent }) => agent === "researcher")).toBe(true);
  expect(JSON.stringify(relkit.manager.calls[0])).toContain("manage-visible");
  expect(JSON.stringify(relkit.manager.calls[0])).not.toContain("root-private");
  expect(JSON.stringify(relkit.researcher.calls[0])).toContain("leaf-visible");
  expect(JSON.stringify(relkit.researcher.calls[0])).not.toContain("manage-visible");
});

async function invokeNested(
  fixture: ReturnType<typeof nestedFixture>,
  events: AgentExecutionEvent[],
  tools: string[],
) {
  return invokeAgent({
    agent: fixture.agent,
    input: { message: "root-private" },
    threadId: "nested:relkit",
    tools: [],
    engine: { invoke: () => Promise.reject(new Error("unexpected RELKIT tool")) },
    contentSink: {
      emitOutput: () => undefined,
      emitEvent: (event) => events.push(event),
      emitTool: ({ toolId, state }) => tools.push(`${toolId}:${state}`),
    },
  });
}

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

function nestedFixture() {
  let effects = 0;
  const lookup = createNativeStringTool("lookup", ({ value }) => {
    effects += 1;
    return value;
  });
  const researcher = createTestModel([
    {
      type: "tool-call",
      callId: "lookup-1",
      toolId: "lookup",
      native: true,
      input: { value: "fact" },
    },
    { type: "final", output: { answer: "leaf-result" } },
  ]);
  const manager = createTestModel([
    {
      type: "tool-call",
      callId: "leaf-1",
      toolId: "task",
      native: true,
      input: { description: "leaf-visible", subagent_type: "researcher" },
    },
    { type: "final", output: { answer: "manager-result" } },
  ]);
  const parent = createTestModel([
    {
      type: "tool-call",
      callId: "manager-1",
      toolId: "task",
      native: true,
      input: { description: "manage-visible", subagent_type: "manager" },
    },
    { type: "final", output: { answer: "parent-result" } },
  ]);
  const leaf = agent("researcher", researcher.model, [lookup]);
  const middle = agent("manager", manager.model, [], [leaf]);
  return {
    agent: agent("parent", parent.model, [], [middle]),
    parent,
    manager,
    researcher,
    lookup,
    effects: () => effects,
  };
}

function agent(
  id: string,
  model: ReturnType<typeof createTestModel>["model"],
  tools: readonly any[],
  subagents?: readonly any[],
) {
  return defineAgent({
    id,
    description: id,
    input: z.object({ message: z.string() }),
    output: z.object({ answer: z.string() }),
    model,
    instructions: `You are ${id}.`,
    tools,
    ...(subagents === undefined ? {} : { subagents }),
    limits,
  });
}

function directNative(fixture: ReturnType<typeof nestedFixture>) {
  const middle = createDeepAgent({
    name: "manager",
    model: fixture.manager.model,
    systemPrompt: "You are manager.",
    tools: [],
    subagents: [
      {
        name: "researcher",
        description: "researcher",
        model: fixture.researcher.model,
        systemPrompt: "You are researcher.",
        tools: [fixture.lookup],
        responseFormat: outputFormat(),
      },
    ],
    responseFormat: outputFormat(),
  });
  return createDeepAgent({
    name: "parent",
    model: fixture.parent.model,
    systemPrompt: "You are parent.",
    tools: [],
    subagents: [{ name: "manager", description: "manager", runnable: middle }],
    responseFormat: outputFormat(),
  });
}

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

function outputFormat() {
  return toolStrategy(
    {
      title: "relkit_output",
      type: "object",
      properties: {
        value: {
          type: "object",
          properties: { answer: { type: "string" } },
          required: ["answer"],
          additionalProperties: false,
        },
      },
      required: ["value"],
      additionalProperties: false,
    },
    { handleError: false },
  );
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
