import { expect, test } from "bun:test";
import { MemorySaver } from "@langchain/langgraph";
import { z } from "@relkit/schema";
import { createNativeStringTool } from "./test-native-tool.ts";
import { createTestModel } from "./test-model.ts";
import { defineAgent, GraphInterruptedError, invokeAgent } from "./src/index.ts";

test("resumes a native DeepAgents human-input checkpoint", async () => {
  const model = createTestModel([
    {
      type: "tool-call",
      callId: "write-1",
      toolId: "danger",
      native: true,
      input: { value: "approved" },
    },
    { type: "final", output: { answer: "finished" } },
  ]);
  let effects = 0;
  const danger = createNativeStringTool("danger", ({ value }) => {
    effects += 1;
    return value;
  });
  const agent = defineAgent({
    id: "deep.hitl",
    input: z.object({ message: z.string() }),
    output: z.object({ answer: z.string() }),
    model: model.model,
    instructions: "Call danger once, then finish.",
    tools: [danger],
    interruptOn: { danger: { allowedDecisions: ["approve"], description: "Review" } },
    checkpointer: new MemorySaver(),
    limits: { maxSteps: 4, maxToolCalls: 2, timeoutMs: 2_000 },
  });
  const waiting: unknown[] = [];
  const common = {
    agent,
    threadId: "thread:hitl",
    tools: {},
    engine: { invoke: () => Promise.reject(new Error("unused")) },
    contentSink: {
      emitOutput: () => undefined,
      emitWaiting: (value: unknown) => waiting.push(value),
    },
  } as const;

  await expect(invokeAgent({ ...common, input: { message: "write" } })).rejects.toBeInstanceOf(
    GraphInterruptedError,
  );
  expect(effects).toBe(0);
  expect(waiting).toHaveLength(1);
  await expect(
    invokeAgent({
      ...common,
      input: { decisions: [{ type: "approve" }] },
      resume: true,
    }),
  ).resolves.toEqual({ answer: "finished" });
  expect(effects).toBe(1);
});
