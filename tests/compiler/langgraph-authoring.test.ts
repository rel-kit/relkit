import { describe, expect, test } from "bun:test";
import * as ts from "typescript";
import {
  END,
  START,
  StateSchema,
} from "../../packages/agents/node_modules/@langchain/langgraph/dist/index.js";
import {
  FakeToolCallingModel,
  todoListMiddleware,
  tool,
} from "../../packages/agents/node_modules/langchain/dist/index.js";
import { defineAgent, defineGraph, defineGraphNode } from "../../packages/agents/src/index.ts";
import { defineFunction } from "../../packages/functions/src/index.ts";
import { normalizeCompilation } from "../../packages/compiler/src/index.ts";
import { readFacts } from "../../packages/compiler/src/discovery/source-facts.ts";
import { z } from "../../packages/schema/src/index.ts";

describe("LangGraph compiler metadata", () => {
  test("discovers defineGraph as an optional-id agent factory", () => {
    const source = ts.createSourceFile(
      "src/order.agent.ts",
      'import { defineGraph } from "@relkit/app/agents"; export const order = defineGraph({});',
      ts.ScriptTarget.Latest,
      true,
    );

    expect(readFacts(source).factoryBindings).toContainEqual(
      expect.objectContaining({
        binding: "order",
        factory: "defineGraph",
        kind: "agent",
        idOptional: true,
      }),
    );
  });

  test("keeps the inspectable workflow on the agent node", () => {
    const state = new StateSchema({ input: z.string(), output: z.string().optional() });
    const run = defineGraphNode({
      id: "run",
      input: z.object({ input: z.string() }),
      output: z.object({ output: z.string() }),
      handler: ({ input }) => ({ output: input }),
    });
    const graph = defineGraph({
      id: "review-graph",
      state,
      input: z.object({ input: z.string() }),
      output: z.object({ output: z.string() }),
      nodes: [run],
      edges: (edge) => edge.addEdge(START, "run").addEdge("run", END),
      limits: { maxSteps: 3, maxToolCalls: 1, timeoutMs: 1_000 },
    });

    const result = normalizeCompilation({ descriptors: [graph] });
    const node = result.graph?.nodes.find((candidate) => candidate.id === "review-graph");

    expect(result.diagnostics).toEqual([]);
    expect(node).toEqual(
      expect.objectContaining({
        kind: "agent",
        execution: "graph",
        workflow: expect.objectContaining({
          start: START,
          end: END,
          nodes: [expect.objectContaining({ id: "run", kind: "node" })],
        }),
      }),
    );
    expect(result.graph?.edges.some((edge) => edge.kind === "uses-provider")).toBe(false);
  });

  test("derives Inspector topology without evaluating graph routes", () => {
    const state = new StateSchema({ input: z.string(), output: z.string().optional() });
    const first = defineGraphNode({
      id: "first",
      input: z.object({ input: z.string() }),
      output: z.object({ output: z.string() }),
      handler: ({ input }) => ({ output: input }),
    });
    const second = defineGraphNode({
      id: "second",
      input: z.object({ input: z.string() }),
      output: z.object({ output: z.string() }),
      handler: ({ input }) => ({ output: input }),
    });
    let routeCalls = 0;
    const graph = defineGraph({
      id: "inspector-workflow",
      state,
      input: z.object({ input: z.string() }),
      output: z.object({ output: z.string() }),
      nodes: [first, second],
      edges: (edge) =>
        edge
          .addEdge(START, "first")
          .addEdge(START, "second")
          .addEdge(["first", "second"], "second")
          .addConditionalEdges(
            "second",
            () => {
              routeCalls += 1;
              return "again";
            },
            { again: "first", done: END },
          ),
      limits: { maxSteps: 5, maxToolCalls: 1, timeoutMs: 1_000 },
    });

    const result = normalizeCompilation({ descriptors: [graph] });
    const node = result.graph?.nodes.find((candidate) => candidate.id === graph.id);

    expect(routeCalls).toBe(0);
    expect(node).toMatchObject({
      workflowTopology: {
        start: START,
        end: END,
        registeredNodes: ["first", "second"],
        conditionalRoutes: [
          {
            from: "second",
            routes: [
              { label: "again", to: "first" },
              { label: "done", to: END },
            ],
          },
        ],
        parallelBranches: [{ from: START, to: ["first", "second"] }],
        joins: [{ from: ["first", "second"], to: "second" }],
      },
    });
    expect(
      (node as { workflowTopology?: { loops: unknown[] } }).workflowTopology?.loops,
    ).toContainEqual({ from: "second", to: "first" });
  });

  test("emits exact native client metadata without runtime instances", () => {
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

    const result = normalizeCompilation({ descriptors: [agent] });
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
  });

  test("projects only safe subagent and resource dependency metadata", () => {
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

    const result = normalizeCompilation({ descriptors: [parent] });
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
  });

  test("projects native agent function dependencies as refs only", () => {
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

    const result = normalizeCompilation({ descriptors: [agent, dependent] });
    const node = result.graph?.nodes.find((candidate) => candidate.id === "invoke");
    expect(node).toMatchObject({
      dependencies: { agents: { assistant: { ref: { kind: "agent", id: "assistant" } } } },
    });
    expect(JSON.stringify(node)).not.toContain("FakeToolCallingModel");
  });
});
