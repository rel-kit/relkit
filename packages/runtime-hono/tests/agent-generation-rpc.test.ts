/** Verifies generation retirement interrupts its accepted run, denies successor continuation and waits for held control reads during cleanup. The same native provider barriers and finally cleanup are retained. */
import { expect, test } from "vitest";
import { createOperationId } from "@relkit/realtime";
import { joinFixtureRuns } from "./fixture-lifetime.js";
import { waitForThreadStatus } from "./agent-rpc-support.fixture.js";
import { createGenerationFixture } from "./agent-generation.fixture.js";
import type { GenerationFixture, AgentRpcRun } from "./agent-rpc-fixture.types.js";

/** Confirms retirement state and rejects continuation by the successor generation.
 * @param fixture - Native scenario context with live execution and cleanup observations.
 * @param accepted - Receipt identifying the original accepted native run.
 * @returns Completion after interrupted ownership and denied-continuation assertions pass.
 */
async function rejectNewGeneration(fixture: GenerationFixture, accepted: AgentRpcRun) {
  const { clientB, agent } = fixture;
  const interrupted = await waitForThreadStatus(
    clientB,
    agent.id,
    accepted.threadId,
    "worker-interrupted",
  );
  expect(interrupted.currentRuns).toMatchObject([
    { runId: accepted.runId, status: "worker-interrupted" },
  ]);
  expect(interrupted.activeRun?.owner.generationId).toBe("generation-a");
  await expect(
    clientB["relkit.agent.control"]({
      agentId: agent.id,
      threadId: accepted.threadId,
      operationId: createOperationId(),
      kind: "approve",
      payload: { decisions: {} },
    }),
  ).rejects.toMatchObject({ code: "GENERATION_UNAVAILABLE" });
  const { executions } = fixture;
  expect(executions).toBe(1);
}

test("generation retirement interrupts its run and a newer generation cannot continue it", async () => {
  const fixture = await createGenerationFixture();
  const { agent, clientA, controlStarted, retired, acceptedRuns, releaseControl } = fixture;
  try {
    const accepted = await clientA["relkit.agent.run"]({
      agentId: agent.id,
      threadId: "generation:retirement",
      operationId: createOperationId(),
      kind: "run",
      payload: "hold",
    });
    await controlStarted.promise;
    retired.abort();
    await rejectNewGeneration(fixture, accepted);
    await Promise.allSettled(acceptedRuns);
    let cleanupSettled = false;
    const joined = joinFixtureRuns().then(() => {
      cleanupSettled = true;
    });
    await Promise.resolve();
    let { controlSettled } = fixture;
    expect(controlSettled).toBe(false);
    expect(cleanupSettled).toBe(false);
    releaseControl.resolve();
    await joined;
    ({ controlSettled } = fixture);
    expect(controlSettled).toBe(true);
  } finally {
    retired.abort();
    releaseControl.resolve();
    await joinFixtureRuns();
  }
});
