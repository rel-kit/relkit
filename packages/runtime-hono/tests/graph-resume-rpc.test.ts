/** Persists a graph wait, rejects unauthorized or invalid replies, and completes one falsy continuation. */
import { expect, test } from "vitest";
import { createOperationId } from "@relkit/realtime";
import { createGraphResumeFixture, waitForStatus } from "./graph-resume-rpc.fixture.js";
import { assertRejectedReplies, assertSuccessfulReply } from "./graph-resume-replies.fixture.js";

test("persists a graph wait and resumes a falsy typed reply on the same thread", async () => {
  const fixture = await createGraphResumeFixture();
  const { client, graph } = fixture;
  const threadId = "order:42";
  await client["relkit.agent.run"]({
    agentId: graph.id,
    threadId,
    operationId: createOperationId(),
    kind: "run",
    payload: { orderId: "42" },
  });
  const waiting = await waitForStatus(client, graph.id, threadId, "waiting");
  expect(waiting.waiting).toMatchObject({ response: { type: "boolean" } });
  expect(waiting.waiting.requests[0]).not.toHaveProperty("id");
  await assertRejectedReplies(fixture, waiting, threadId);
  await assertSuccessfulReply(fixture, waiting, threadId);
});
