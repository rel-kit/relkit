import { expect, test } from "bun:test";
import { invokeAgent } from "@relkit/app/agents";
import assistant, { uppercase } from "@app/hello/agents/assistant.agent.js";
import lookup from "@app/hello/tools/lookup.tool.js";

test("assistant runs native tools and todo middleware without a paid provider", async () => {
  expect(assistant.tools).toEqual([expect.objectContaining({ ref: lookup.ref }), uppercase]);
  expect(assistant.middleware.map((middleware) => middleware.name)).toEqual(["todoListMiddleware"]);
  expect(assistant.client?.state).toEqual(["todos"]);
  expect(assistant.limits).toEqual({ maxSteps: 4, maxToolCalls: 4, timeoutMs: 10_000 });

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
