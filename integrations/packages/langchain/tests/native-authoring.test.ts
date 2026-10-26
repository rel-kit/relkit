/** Exercises native authoring behavior through the integration owner, preserving the original assertions and scoped test fixtures. */

import { describe, expect, expectTypeOf, test } from "vitest";
import { createMiddleware, FakeToolCallingModel, todoListMiddleware, tool } from "langchain";
import { Annotation } from "@langchain/langgraph";
import { z } from "@relkit/schema";
import {
  defineAgent,
  isAgentDescriptor,
  type AgentClientStateKey,
  type AgentMiddleware,
  type AgentSubagent,
} from "../src/index.ts";
import type { TestAgent, TestAgentDescriptor } from "../src/testing/agents.js";

describe("native LangChain authoring", () => {
  test(
    "keeps native values intact and selects middleware state",
    caseKeepsNativeValuesIntactAndSelectsMiddleware,
  );

  test(
    "rejects undeclared public state and duplicate native entries",
    caseRejectsUndeclaredPublicStateAndDuplicateNative,
  );
  test("retains tuple, empty, private and erased middleware state keys", caseClientStateKeys);
});

/** Verifies that keeps native values intact and selects middleware state.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
function caseKeepsNativeValuesIntactAndSelectsMiddleware() {
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
    limits: { maxSteps: 4, maxToolCalls: 4, timeoutMs: 1000 },
    stateProfile: "public",
    client: { public: true, state: ["todos"] },
  });
  const selected: readonly "todos"[] | undefined = agent.client?.state;
  expectTypeOf(agent.middleware).toEqualTypeOf<readonly [typeof todos]>();
  expectTypeOf(agent).toExtend<TestAgentDescriptor>();
  expectTypeOf<Parameters<TestAgent<typeof agent>["invoke"]>[0]>().toExtend<{
    message: string;
  }>();
  expectTypeOf<ReturnType<TestAgent<typeof agent>["invoke"]>>().toExtend<
    Promise<{ answer: string }>
  >();
  expectTypeOf<{ message: number }>().not.toExtend<
    Parameters<TestAgent<typeof agent>["invoke"]>[0]
  >();
  expectTypeOf<"missing">().not.toExtend<NonNullable<typeof selected>[number]>();
  expectTypeOf<AgentClientStateKey<readonly []>>().toEqualTypeOf<never>();
  expectTypeOf<Promise<{ answer: number }>>().not.toExtend<
    ReturnType<TestAgent<typeof agent>["invoke"]>
  >();
  expect(selected).toEqual(["todos"]);
  expect(agent.model).toBe(model);
  expect(agent.tools[0]).toBe(nativeTool);
  expect(agent.middleware[0]).toBe(todos);
  expect(Object.isFrozen(model)).toBe(false);
  expect(Object.isFrozen(nativeTool)).toBe(false);
  expect(Object.isFrozen(todos)).toBe(false);
  expect(isAgentDescriptor(agent)).toBe(true);
}

/** Verifies that rejects undeclared public state and duplicate native entries.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
function caseRejectsUndeclaredPublicStateAndDuplicateNative() {
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
    limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 1000 },
    stateProfile: "public",
  } as const;
  expect(() =>
    defineAgent({ ...base, client: { public: true, state: ["missing"] } } as never),
  ).toThrow('state key "missing" is not declared');
  expect(() => defineAgent({ ...base, middleware: [todos, todos] })).toThrow(
    'Duplicate agent middleware "todoListMiddleware"',
  );
}

/** Checks the exact public key vocabulary of real native middleware instances.
 * @returns Nothing after checking concrete and erased native descriptor types.
 */
function caseClientStateKeys() {
  const todos = todoListMiddleware();
  const extra = createMiddleware({
    name: "fixture.state",
    stateSchema: Annotation.Root({ summary: Annotation<string>(), _private: Annotation<string>() }),
  });
  const noState = createMiddleware({ name: "fixture.no-state" });
  expectTypeOf<AgentClientStateKey<readonly [typeof todos, typeof extra]>>().toEqualTypeOf<
    "todos" | "summary"
  >();
  expectTypeOf<AgentClientStateKey<readonly AgentMiddleware[]>>().toEqualTypeOf<string>();
  expectTypeOf<AgentClientStateKey<readonly (typeof todos)[]>>().toEqualTypeOf<"todos">();
  expectTypeOf<AgentClientStateKey<readonly []>>().toEqualTypeOf<never>();
  expectTypeOf<AgentClientStateKey<readonly [typeof noState]>>().toEqualTypeOf<never>();
  const empty = defineAgent({
    id: "native.empty",
    input: z.string(),
    output: z.string(),
    instructions: "Reply.",
    tools: [],
    limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 1000 },
  });
  expectTypeOf(empty).toExtend<AgentSubagent>();
}
