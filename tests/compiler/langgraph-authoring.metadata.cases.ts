/** Retains original metadata assertions for langgraph-authoring, registered by the owning suite. */
import { nativeAgentRuntimePackages } from "./native-agent-runtime.fixture.js";
import { expect } from "bun:test";
import {
  FakeToolCallingModel,
  todoListMiddleware,
  tool,
} from "../../integrations/packages/langchain/node_modules/langchain/dist/index.js";
import { defineAgent } from "../../integrations/packages/langchain/src/index.ts";
import { defineFunction } from "../../packages/functions/src/index.ts";
import { normalizeCompilation } from "../../packages/compiler/src/index.ts";
import { z } from "../../packages/schema/src/index.ts";
export function case4Metadata() {
  const agent = nativeClientFixture();

  const result = normalizeCompilation({
    runtimeIntegrationPackages: nativeAgentRuntimePackages,
    descriptors: [agent],
  });
  const node = result.graph?.nodes.find((candidate) => candidate.id === agent.id);

  expect(result.diagnostics).toEqual([]);
  expect(node).not.toHaveProperty("model");
  expect(node).toMatchObject({
    modelSource: "native",
    clientContract: {
      tools: [
        { id: "echo", input: { properties: { text: { type: "string" } } } },
        { id: "write_todos", input: { properties: { todos: { type: "array" } } } },
      ],
      state: [
        {
          name: "todos",
          schema: {
            items: {
              properties: { status: { enum: ["pending", "in_progress", "completed"] } },
            },
          },
        },
      ],
      events: [{ name: "notice", schema: { properties: { message: { type: "string" } } } }],
    },
  });
  expect(result.graph?.edges).not.toContainEqual({
    kind: "uses-provider-profile",
    from: agent.id,
    to: "provider.model.default",
  });
  expect(result.outputs.clientRegistry).not.toContain("langchain");
}

export function case5Metadata() {
  const child = defineAgent({
    id: "researcher",
    input: z.string(),
    output: z.string(),
    model: new FakeToolCallingModel(),
    instructions: "Research.",
    tools: [],
    limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 1_000 },
  });
  const parent = defineAgent({
    id: "coordinator",
    input: z.string(),
    output: z.string(),
    model: new FakeToolCallingModel(),
    instructions: "Coordinate.",
    tools: [],
    subagents: [child],
    skills: ["/private/skills/research"],
    memory: ["/private/memory/notes.md"],
    checkpointer: {} as never,
    store: {} as never,
    limits: { maxSteps: 2, maxToolCalls: 1, timeoutMs: 1_000 },
  });

  const result = normalizeCompilation({
    runtimeIntegrationPackages: nativeAgentRuntimePackages,
    descriptors: [parent],
  });
  const node = result.graph?.nodes.find((candidate) => candidate.id === parent.id);
  expect(node).toMatchObject({
    subagents: [{ id: "researcher", subagents: [] }],
    resourceDependencies: [
      { kind: "model" },
      { kind: "checkpointer", ownership: "borrowed" },
      { kind: "memory", ownership: "borrowed" },
      { kind: "skills", count: 1 },
      { kind: "memory-files", count: 1 },
    ],
  });
  expect(JSON.stringify(node)).not.toContain("/private/");
}

export function case6Metadata() {
  const agent = defineAgent({
    id: "assistant",
    input: z.string(),
    output: z.string(),
    model: new FakeToolCallingModel(),
    instructions: "Answer.",
    tools: [],
    limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 1_000 },
  });
  const dependent = defineFunction({
    id: "invoke",
    input: z.string(),
    output: z.string(),
    dependencies: { agents: { assistant: agent } },
    handler: (value) => value,
  });

  const result = normalizeCompilation({
    runtimeIntegrationPackages: nativeAgentRuntimePackages,
    descriptors: [agent, dependent],
  });
  const node = result.graph?.nodes.find((candidate) => candidate.id === "invoke");
  expect(node).toMatchObject({
    dependencies: { agents: { assistant: { ref: { kind: "agent", id: "assistant" } } } },
  });
  expect(JSON.stringify(node)).not.toContain("FakeToolCallingModel");
}

/** Constructs the original scenario without evaluating runtime callbacks. */
function nativeClientFixture() {
  const todos = todoListMiddleware();
  const echo = tool(async ({ text }) => text, {
    name: "echo",
    description: "Echo text",
    schema: z.object({ text: z.string() }),
  });
  const agent = defineAgent({
    id: "native-client",
    input: z.object({ message: z.string() }),
    output: z.object({ answer: z.string() }),
    model: new FakeToolCallingModel(),
    instructions: "Answer.",
    tools: [echo],
    middleware: [todos],
    limits: { maxSteps: 2, maxToolCalls: 2, timeoutMs: 1_000 },
    stateProfile: "default",
    client: {
      public: true,
      state: ["todos"],
      events: { notice: z.object({ message: z.string() }) },
    },
  });
  return agent;
}
