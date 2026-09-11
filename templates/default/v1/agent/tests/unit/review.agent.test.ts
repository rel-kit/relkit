import { expect, test } from "bun:test";
import { GraphInterruptedError, invokeAgent } from "@relkit/app/agents";
import review from "@app/hello/agents/review.agent.js";

const runtime = {
  agent: review,
  tools: {},
  engine: { invoke: async () => Promise.reject(new Error("Unexpected function invocation")) },
};

test("review graph interrupts and resumes on an explicit thread", async () => {
  const threadId = "test:review";
  await expect(
    invokeAgent({ ...runtime, input: { request: "Publish" }, threadId }),
  ).rejects.toBeInstanceOf(GraphInterruptedError);
  await expect(invokeAgent({ ...runtime, input: true, threadId, resume: true })).resolves.toEqual({
    result: "Publish approved",
  });
});
