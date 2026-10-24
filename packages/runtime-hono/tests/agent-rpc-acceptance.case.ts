/** Exercises rejected requests, idempotent cross-transport acceptance, durable replay and cross-generation stop on one echo fixture. Assertions and request order remain those of the original RPC acceptance scenario. */
import { expect } from "vitest";
import { createOperationId } from "@relkit/realtime";
import { waitForIdle } from "./agent-rpc-support.fixture.js";
import type { EchoRpcFixture, AgentRpcRun, AgentRpcSnapshot } from "./agent-rpc-fixture.types.js";

/** Rejects unsupported and malformed requests before accepting one idempotent run.
 * @param fixture - Native scenario context with live execution and cleanup observations.
 * @returns The first accepted receipt after duplicate acceptance and rejection assertions pass.
 */
export async function admitEchoRun(fixture: EchoRpcFixture) {
  const {
    client,
    incompatibleClient,
    agent,
    operationId,
    threadId,
    authorizedOperations,
    socketClient,
  } = fixture;
  await expect(
    incompatibleClient["relkit.agent.load"]({ agentId: agent.id, threadId }),
  ).rejects.toMatchObject({ code: "AGENT_CAPABILITIES_UNSUPPORTED" });
  await expect(
    client["relkit.agent.run"]({
      agentId: agent.id,
      operationId: createOperationId(),
      kind: "run",
      payload: "hello",
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  const { executions } = fixture;
  expect(executions).toBe(0);
  const first = await client["relkit.agent.run"]({
    agentId: agent.id,
    threadId,
    operationId,
    kind: "load",
    payload: "hello",
  });
  expect(authorizedOperations[0]).toBe("run");
  const duplicate = await socketClient["relkit.agent.run"]({
    agentId: agent.id,
    threadId,
    expectedIdentity: { identityScope: "viewer", sessionEpoch: "session" },
    operationId,
    kind: "run",
    payload: "hello",
  });
  expect(duplicate).toMatchObject({
    threadId,
    runId: first.runId,
    duplicate: true,
  });
  return first;
}

/** Waits for the accepted run and verifies native execution and durable messages.
 * @param fixture - Native scenario context with live execution and cleanup observations.
 * @param first - Receipt for the first accepted run on the reusable thread.
 * @returns The settled snapshot after native execution and message assertions pass.
 */
export async function verifyEchoRun(fixture: EchoRpcFixture, first: AgentRpcRun) {
  const { client, agent, server } = fixture;
  const snapshot = await waitForIdle(client, agent.id, first.threadId);
  const { executions } = fixture;
  expect(executions).toBe(1);
  expect(await (await fetch(`http://127.0.0.1:${server.port}/__fixture/state`)).json()).toEqual({
    executions: 0,
  });
  expect(snapshot.currentMessages.map((message: { role: string }) => message.role)).toEqual([
    "user",
    "assistant",
  ]);
  expect(
    snapshot.currentMessages.map(
      (message: { parts: readonly { text?: string }[] }) => message.parts[0]?.text,
    ),
  ).toEqual(["hello", "hello"]);
  expect(snapshot.currentMessages[1]?.parts[0]?.state).toBe("complete");
  expect(snapshot.currentRuns).toMatchObject([{ runId: first.runId, status: "succeeded" }]);
  return snapshot;
}

/** Checks durable history, stale-provider gap replay and thread listing.
 * @param fixture - Native scenario context with live execution and cleanup observations.
 * @param first - Receipt for the first accepted run on the reusable thread.
 * @param snapshot - Durable snapshot captured after the first run settles.
 * @returns Completion after the replay iterator is closed and listing assertions pass.
 */
export async function verifyEchoReplay(
  fixture: EchoRpcFixture,
  first: AgentRpcRun,
  snapshot: AgentRpcSnapshot,
) {
  const { client, agent, threadId } = fixture;
  expect(
    await client["relkit.agent.history"]({
      agentId: agent.id,
      threadId,
      snapshotId: snapshot.snapshotId,
      cursor: "0",
    }),
  ).toEqual({ messages: [] });
  const gapStream = await client["relkit.agent.observe"]({
    agentId: agent.id,
    threadId: first.threadId,
    after: { ...snapshot.checkpoint, providerEpoch: "stale-provider" },
  });
  const gapIterator = gapStream[Symbol.asyncIterator]();
  expect(await gapIterator.next()).toMatchObject({
    value: {
      kind: "gap",
      reason: "provider-reset",
      snapshot: { checkpoint: snapshot.checkpoint },
    },
  });
  await gapIterator.return?.();
  expect(await client["relkit.agent.threads"]({ agentId: agent.id })).toMatchObject({
    threads: [{ threadId: first.threadId, preview: "hello", status: "idle" }],
  });
}

/** Stops the next held run from another generation and checks preserved history.
 * @param fixture - Native scenario context with live execution and cleanup observations.
 * @param first - Receipt for the first accepted run on the reusable thread.
 * @returns Completion after cancellation, history and control-settlement assertions pass.
 */
export async function verifyEchoStop(fixture: EchoRpcFixture, first: AgentRpcRun) {
  const { client, clientB, agent, threadId, histories, threadIds } = fixture;
  const second = await client["relkit.agent.run"]({
    agentId: agent.id,
    threadId: first.threadId,
    operationId: createOperationId(),
    kind: "run",
    payload: "hold",
  });
  const stopped = await clientB["relkit.agent.control"]({
    agentId: agent.id,
    threadId: first.threadId,
    operationId: createOperationId(),
    kind: "stop",
    payload: { mode: "graceful" },
  });
  expect(stopped.status).toBe("accepted");
  expect(
    (await clientB["relkit.agent.load"]({ agentId: agent.id, threadId: first.threadId })).thread
      .status,
  ).toBe("stopping");
  const afterStop = await waitForIdle(client, agent.id, first.threadId);
  const { executions } = fixture;
  expect(executions).toBe(2);
  expect(afterStop.currentRuns).toMatchObject([
    { runId: first.runId, status: "succeeded" },
    { runId: second.runId, status: "cancelled" },
  ]);
  expect(afterStop.controls).toMatchObject([{ status: "applied", effect: "confirmed" }]);
  expect(histories).toEqual([
    [],
    [
      { role: "user", content: '{"message":"hello"}' },
      { role: "assistant", content: '{"answer":"hello"}' },
    ],
  ]);
  expect(threadIds).toEqual([threadId, threadId]);
}
