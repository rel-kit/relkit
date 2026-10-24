/** DeepAgents resumes human approval through public RPC without exposing native interrupt identifiers. */
import { expect, test } from "vitest";
import { createOperationId } from "@relkit/realtime";
import { createDeepFixture, resume, waitForStatus } from "./deepagent-resume.fixture.js";
import { assertDeepWaiting } from "./deepagent-waiting.fixture.js";

test("persists and resumes native DeepAgents human input without exposing native IDs", async () => {
  const { agent, client, effects } = await createDeepFixture();
  const threadId = "review:42";
  await client["relkit.agent.run"]({
    agentId: agent.id,
    threadId,
    operationId: createOperationId(),
    kind: "run",
    payload: { message: "write" },
  });
  const waiting = await waitForStatus(client, agent.id, threadId, "waiting");
  expect(effects()).toBe(0);
  assertDeepWaiting(waiting);
  await resume(client, agent.id, threadId, waiting.waiting.revision, {
    decisions: [{ type: "approve" }],
  });
  const finished = await waitForStatus(client, agent.id, threadId, "idle");
  expect(effects()).toBe(1);
  expect(finished.currentRuns).toMatchObject([{ status: "waiting" }, { status: "succeeded" }]);
  expect(finished.currentMessages.at(-1)?.parts[0]).toMatchObject({
    kind: "text",
    text: '{"answer":"finished"}',
    state: "complete",
  });
});
