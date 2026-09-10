import { expect, test } from "bun:test";
import { invokeAgent } from "@relkit/app/agents";
import assistant from "@app/hello/agents/assistant.agent.js";
import lookup from "@app/hello/tools/lookup.tool.js";

test("assistant runs with native todo middleware and the offline model", async () => {
  expect(assistant.client?.state).toEqual(["todos"]);
  expect(assistant.middleware.map((middleware) => middleware.name)).toEqual(["todoListMiddleware"]);
  await expect(
    invokeAgent({
      agent: assistant,
      input: { message: "Greet Ada" },
      threadId: "test:assistant",
      tools: [lookup],
      engine: { invoke: async () => ({ message: "Hello, Ada!" }) },
    }),
  ).resolves.toEqual({ answer: "Hello from the offline LangChain model." });
});
