/** Verifies two interrupted tool approvals admit one continuation, deduplicate concurrent control requests and preserve progress without replaying the original agent execution. */
import { expect, test } from "vitest";
import { createOperationId } from "@relkit/realtime";
import { waitForAgentRun } from "../src/agent-run-tasks.ts";
import { createApprovalFixture } from "./agent-approval.fixture.js";
import { waitForStatus } from "./agent-approval-plan.fixture.js";
import type { ApprovalFixture, AgentRpcRun } from "./agent-rpc-fixture.types.js";

/** Accepts the original run and checks its two pending approvals and progress message.
 * @param fixture - Native scenario context with live execution and cleanup observations.
 * @returns The accepted receipt and both persisted pending approval identities.
 */
async function beginApproval(fixture: ApprovalFixture) {
  const { client, agent } = fixture;
  const accepted = await client["relkit.agent.run"]({
    agentId: agent.id,
    threadId: "conversation:approval",
    operationId: createOperationId(),
    kind: "run",
    payload: "cancel order",
  });
  const interrupted = await waitForStatus(
    client,
    agent.id,
    accepted.threadId,
    "approval-interrupted",
  );
  expect(interrupted.approvals).toHaveLength(2);
  expect(interrupted.currentMessages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        role: "tool",
        parts: [expect.objectContaining({ kind: "progress", value: { stage: "waiting" } })],
      }),
    ]),
  );
  const approvalIds = interrupted.approvals.map(
    (approval: { approvalId: string }) => approval.approvalId,
  );
  return { accepted, approvalIds };
}

/** Builds one idempotency identity for both concurrent approval submissions.
 * @param agentId - Registered agent identity selected by the scenario.
 * @param threadId - Durable conversation identity reused across RPC requests.
 * @param approvalIds - Persisted approval identities returned by the interrupted run.
 * @returns One shared operation identity and its approval decision payload.
 */
function approvalControl(agentId: string, threadId: string, approvalIds: readonly string[]) {
  const operationId = createOperationId();
  const control = {
    agentId,
    threadId,
    operationId,
    kind: "approve",
    payload: { decisions: Object.fromEntries(approvalIds.map((id: string) => [id, "approve"])) },
  };
  return { control, operationId };
}

/** Checks the settled continuation and durable deduplicated control receipt.
 * @param fixture - Native scenario context with live execution and cleanup observations.
 * @param accepted - Receipt identifying the original accepted native run.
 * @param approvalIds - Persisted approval identities returned by the interrupted run.
 * @param decision - Shared control payload and operation identity used for deduplication.
 * @returns Completion after durable approval/control assertions and tracked run settlement.
 */
async function verifyApprovalSettlement(
  fixture: ApprovalFixture,
  accepted: AgentRpcRun,
  approvalIds: readonly string[],
  decision: ReturnType<typeof approvalControl>,
) {
  const { client, agent } = fixture;
  const { control, operationId } = decision;
  const settled = await waitForStatus(client, agent.id, accepted.threadId, "idle");
  const { executions } = fixture;
  expect(executions).toBe(1);
  expect(settled.currentRuns).toMatchObject([
    { runId: accepted.runId, status: "approval-interrupted" },
    { status: "succeeded" },
  ]);
  expect(settled.approvals).toMatchObject([
    { approvalId: approvalIds[0], status: "approved" },
    { approvalId: approvalIds[1], status: "approved" },
  ]);
  expect(settled.controls).toMatchObject([
    { controlId: operationId, status: "applied", effect: "confirmed" },
  ]);
  expect(await client["relkit.agent.control"](control)).toMatchObject({
    operationId,
    duplicate: true,
  });
  await waitForAgentRun(accepted.runId);
}

test("approval interruption admits one continuation without replaying agent execution", async () => {
  const fixture = await createApprovalFixture();
  const { client, agent } = fixture;
  const { accepted, approvalIds } = await beginApproval(fixture);
  const decision = approvalControl(agent.id, accepted.threadId, approvalIds);
  const { control } = decision;
  const receipts = await Promise.all([
    client["relkit.agent.control"](control),
    client["relkit.agent.control"](control),
  ]);
  expect(receipts.map((receipt) => receipt.duplicate).sort()).toEqual([false, true]);
  await verifyApprovalSettlement(fixture, accepted, approvalIds, decision);
});
