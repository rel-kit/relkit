import { expect, test } from "bun:test";
import assistant from "../../src/agents/assistant.agent.js";

test("assistant declares its bounded tool surface", () => {
  expect(assistant.modelProfile).toBe("default");
  expect(assistant.tools.map((tool) => tool.ref.id)).toEqual(["hello.lookup"]);
  expect(assistant.limits).toEqual({ maxSteps: 4, maxToolCalls: 4, timeoutMs: 10_000 });
});
