import { expect, test } from "bun:test";
import { createTestAgent, invokeFunction } from "@relkit/testing";
import assistant from "@app/hello/agents/assistant.agent.js";
import askAssistant from "@app/hello/functions/ask-assistant.function.js";
import hello from "@app/hello/functions/hello.function.js";
import lookup from "@app/hello/tools/lookup.tool.js";

test("assistant uses a function-derived tool with an offline AI SDK model", async () => {
  expect(assistant.model).toBe("openai:gpt-5-mini");
  expect(assistant.tools.map((tool) => tool.ref.id)).toEqual(["hello.lookup"]);
  expect(assistant.limits).toEqual({ maxSteps: 4, maxToolCalls: 4, timeoutMs: 10_000 });

  const agent = createTestAgent({
    agent: assistant,
    tools: [lookup],
    engine: {
      invoke: (request) =>
        invokeFunction(hello, request.input as Parameters<typeof hello.invoke>[0]),
    },
    model: { provider: "openai", modelId: "gpt-5-mini" },
    // Script the model's choices while running the real greeting function.
    script: [
      {
        type: "tool-call",
        callId: "call-1",
        toolId: "hello.lookup",
        input: { name: "Ada" },
      },
      { type: "final", output: { answer: "Hello, Ada!" } },
    ],
  });

  await expect(
    invokeFunction(
      askAssistant,
      { question: "greet Ada" },
      {
        clients: { agents: { "hello.assistant": agent.invoke } },
      },
    ),
  ).resolves.toEqual({ answer: "Hello, Ada!" });
  expect(agent.model.calls).toHaveLength(2);
});
