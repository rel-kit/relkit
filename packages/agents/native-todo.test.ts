import { expect, test } from "bun:test";
import { z } from "@relkit/schema";
import { todoListMiddleware } from "langchain";
import { defineAgent, invokeAgent, type AgentExecutionEvent } from "./src/index.ts";
import { createTestModel } from "./test-model.ts";

const pending = [
  { content: "Find the order", status: "in_progress" },
  { content: "Explain its state", status: "pending" },
] as const;
const progressing = [
  { content: "Find the order", status: "completed" },
  { content: "Explain its state", status: "in_progress" },
] as const;
const completed = [
  { content: "Find the order", status: "completed" },
  { content: "Explain its state", status: "completed" },
] as const;

test("native todo middleware replaces public state before final output", async () => {
  const todos = todoListMiddleware();
  const model = createTestModel([
    nativeTodo("todo-1", pending),
    nativeTodo("todo-2", progressing),
    nativeTodo("todo-3", completed),
    { type: "final", output: { answer: "The order is ready." } },
  ]);
  const agent = defineAgent({
    id: "support.todos",
    input: z.object({ message: z.string() }),
    output: z.object({ answer: z.string() }),
    model: model.model,
    instructions: "Use the todo list for this request.",
    tools: [],
    middleware: [todos],
    limits: { maxSteps: 5, maxToolCalls: 4, timeoutMs: 1_000 },
    stateProfile: "public",
    client: { public: true, state: ["todos"] },
  });
  const states: unknown[] = [];
  const toolStates: string[] = [];
  const timeline: string[] = [];
  const firstUpdate = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let blocked = false;

  const run = invokeAgent({
    agent,
    modelRegistry: {},
    tools: [],
    engine: { invoke: () => Promise.reject(new Error("Unexpected RELKIT tool")) },
    input: { message: "Check the order" },
    contentSink: {
      emitEvent: async (event: AgentExecutionEvent) => {
        if (event.kind !== "values" || !hasTodos(event.value)) return;
        states.push(event.value.todos);
        timeline.push("todos");
        if (!blocked && JSON.stringify(event.value.todos) === JSON.stringify(pending)) {
          blocked = true;
          firstUpdate.resolve();
          await release.promise;
        }
      },
      emitTool: ({ toolId, state }) => {
        if (toolId === "write_todos") toolStates.push(state);
      },
      emitOutput: () => timeline.push("output"),
    },
  });

  await firstUpdate.promise;
  expect(states.at(-1)).toEqual(pending);
  expect(timeline).not.toContain("output");
  release.resolve();
  await expect(run).resolves.toEqual({ answer: "The order is ready." });

  expect(states).toEqual(expect.arrayContaining([pending, progressing, completed]));
  expect(states.at(-1)).toEqual(completed);
  expect(timeline.lastIndexOf("todos")).toBeLessThan(timeline.indexOf("output"));
  expect(toolStates).toEqual([
    "started",
    "input-ready",
    "running",
    "succeeded",
    "started",
    "input-ready",
    "running",
    "succeeded",
    "started",
    "input-ready",
    "running",
    "succeeded",
  ]);
  expect(model.calls).toHaveLength(4);
});

function nativeTodo(callId: string, todos: typeof pending | typeof progressing | typeof completed) {
  return {
    type: "tool-call" as const,
    callId,
    toolId: "write_todos",
    native: true,
    input: { todos: [...todos] },
  };
}

function hasTodos(value: unknown): value is { readonly todos: unknown } {
  return value !== null && typeof value === "object" && "todos" in value;
}
