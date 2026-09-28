import { z } from "@relkit/schema";
import { defineAgent } from "../src/index.ts";
import { createTestModel } from "./test-model.ts";
import { createNativeStringTool } from "./test-native-tool.ts";

const limits = { maxSteps: 8, maxToolCalls: 8, timeoutMs: 2_000 };

export function nestedFixture() {
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
