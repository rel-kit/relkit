/** Exercises public selected native execution, checkpoint reuse, tool streaming and test-helper cancellation in an external packed installation. */
import { expect, test } from "bun:test";
import { MemorySaver } from "@langchain/langgraph";
import { tool } from "langchain";
import { defineAgent, invokeAgent } from "@relkit/langchain";
import { createTestAgent, createTestModel } from "@relkit/langchain/testing";
import { z } from "@relkit/schema";

const limits = { maxSteps: 4, maxToolCalls: 2, timeoutMs: 5_000 };
const engine = {
  invoke: async () => {
    throw new Error("Unexpected RELKIT tool");
  },
};

test("one selected native tool streams once and retains checkpoint history", toolAndCheckpoint);
test("public test agent helper invokes a selected native agent", publicHarness);
test("native generation cancellation settles and model ownership closes", cancelGeneration);

function selectedToolFixture() {
  let executions = 0;
  const nativeTool = tool(
    async ({ value }: { value: number }) => {
      executions += 1;
      return { doubled: value * 2 };
    },
    { name: "double", description: "Double a number", schema: z.object({ value: z.number() }) },
  );
  const model = createTestModel({
    script: [
      { type: "tool-call", callId: "double-1", toolId: "double", input: { value: 21 } },
      { type: "final", output: { answer: "42" } },
      { type: "final", output: { answer: "retained" } },
    ],
  });
  const saver = new MemorySaver();
  const agent = defineAgent({
    id: "packed.double",
    input: z.object({ message: z.string() }),
    output: z.object({ answer: z.string() }),
    model: model.languageModel,
    instructions: "Use the selected tool.",
    tools: [nativeTool],
    checkpointer: saver,
    limits,
  });
  return { agent, model, saver, executions: () => executions };
}

async function toolAndCheckpoint() {
  const { agent, model, saver, executions } = selectedToolFixture();
  const states: string[] = [];
  const values: string[] = [];
  try {
    const first = await invokeAgent({
      agent,
      tools: [],
      engine,
      threadId: "packed-thread",
      input: { message: "Double 21" },
      contentSink: {
        emitTool: ({ toolId, state }) => {
          if (toolId === "double") states.push(state);
        },
        emitOutput: (value) => {
          values.push(JSON.stringify(value));
        },
      },
    });
    expect(first).toEqual({ answer: "42" });
    expect(executions()).toBe(1);
    expect(states).toEqual(["started", "input-ready", "running", "succeeded"]);
    expect(values.length).toBeGreaterThan(0);
    const checkpoint = await saver.getTuple({ configurable: { thread_id: "packed-thread" } });
    expect(checkpoint?.checkpoint).toBeDefined();
    expect(
      await invokeAgent({
        agent,
        tools: [],
        engine,
        threadId: "packed-thread",
        input: { message: "Continue" },
      }),
    ).toEqual({ answer: "retained" });
    expect(model.calls).toHaveLength(3);
    expect(executions()).toBe(1);
    expect(model.calls[2]?.request.messages.length).toBeGreaterThan(
      model.calls[0]?.request.messages.length ?? 0,
    );
  } finally {
    await model.close();
  }
}

async function publicHarness() {
  const agent = defineAgent({
    id: "packed.helper",
    input: z.object({ message: z.string() }),
    output: z.object({ answer: z.string() }),
    instructions: "Reply",
    tools: [],
    limits,
  });
  const helper = createTestAgent({
    agent,
    tools: [],
    engine,
    script: [{ type: "final", output: { answer: "helper" } }],
  });
  try {
    expect(await helper.invoke({ message: "Hello" })).toEqual({ answer: "helper" });
    expect(helper.model.calls).toHaveLength(1);
  } finally {
    await helper.close();
  }
}

async function cancelGeneration() {
  const model = createTestModel({ hang: true });
  const controller = new AbortController();
  try {
    const pending = model.languageModel.invoke("cancel", { signal: controller.signal });
    const settled = Promise.allSettled([pending]);
    for (let attempt = 0; attempt < 100 && model.calls.length === 0; attempt++) await Bun.sleep(1);
    controller.abort(new Error("packed cancellation"));
    expect((await settled)[0]?.status).toBe("rejected");
    await model.close();
    await model.close();
  } finally {
    controller.abort();
    await model.close();
  }
}
