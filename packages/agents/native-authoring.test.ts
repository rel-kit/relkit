import { describe, expect, test } from "bun:test";
import { FakeToolCallingModel, todoListMiddleware, tool } from "langchain";
import { z } from "@relkit/schema";
import { defineAgent, isAgentDescriptor } from "./src/index.ts";

describe("native LangChain authoring", () => {
  test("keeps native values intact and selects middleware state", () => {
    const model = new FakeToolCallingModel();
    const nativeTool = tool(async ({ value }) => value, {
      name: "echo",
      description: "Echo text",
      schema: z.object({ value: z.string() }),
    });
    const todos = todoListMiddleware();
    const agent = defineAgent({
      id: "native.todos",
      input: z.object({ message: z.string() }),
      output: z.object({ answer: z.string() }),
      model,
      instructions: "Track the work.",
      tools: [nativeTool],
      middleware: [todos],
      limits: { maxSteps: 4, maxToolCalls: 4, timeoutMs: 1_000 },
      stateProfile: "public",
      client: { public: true, state: ["todos"] },
    });

    const selected: readonly "todos"[] | undefined = agent.client?.state;
    expect(selected).toEqual(["todos"]);
    expect(agent.model).toBe(model);
    expect(agent.tools[0]).toBe(nativeTool);
    expect(agent.middleware[0]).toBe(todos);
    expect(Object.isFrozen(model)).toBe(false);
    expect(Object.isFrozen(nativeTool)).toBe(false);
    expect(Object.isFrozen(todos)).toBe(false);
    expect(isAgentDescriptor(agent)).toBe(true);
  });

  test("rejects undeclared public state and duplicate native entries", () => {
    const model = new FakeToolCallingModel();
    const todos = todoListMiddleware();
    const base = {
      id: "native.invalid",
      input: z.string(),
      output: z.string(),
      model,
      instructions: "Answer.",
      tools: [],
      middleware: [todos],
      limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 1_000 },
      stateProfile: "public",
    } as const;

    expect(() =>
      defineAgent({ ...base, client: { public: true, state: ["missing"] } } as never),
    ).toThrow('state key "missing" is not declared');
    expect(() => defineAgent({ ...base, middleware: [todos, todos] })).toThrow(
      'Duplicate agent middleware "todoListMiddleware"',
    );
  });
});
