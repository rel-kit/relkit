/** Checks that queuing a follow-up starts exactly one additional segment on the same durable thread after the first segment is released. Original input, status and applied-control assertions are preserved. */
import { expect, test } from "vitest";
import { createOperationId } from "@relkit/realtime";
import { waitForRunCount } from "./agent-rpc-support.fixture.js";
import { createFollowUpFixture } from "./agent-follow-up.fixture.js";

test("a queued follow-up starts one new segment on the reusable thread", async () => {
  const { agent, client, release, inputs } = await createFollowUpFixture();
  const first = await client["relkit.agent.run"]({
    agentId: agent.id,
    threadId: "conversation:follow-up",
    operationId: createOperationId(),
    kind: "run",
    payload: "first",
  });
  await client["relkit.agent.control"]({
    agentId: agent.id,
    threadId: first.threadId,
    operationId: createOperationId(),
    kind: "follow-up",
    payload: "second",
  });
  release();
  const snapshot = await waitForRunCount(client, agent.id, first.threadId, 2);
  expect(inputs).toEqual(["first", "second"]);
  expect(snapshot.thread.status).toBe("idle");
  expect(snapshot.currentRuns.map((run: { status: string }) => run.status)).toEqual([
    "succeeded",
    "succeeded",
  ]);
  expect(snapshot.controls).toMatchObject([{ status: "applied", effect: "confirmed" }]);
});
