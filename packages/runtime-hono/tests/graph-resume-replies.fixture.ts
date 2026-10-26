/** Retains public RPC denial, stale revision, duplicate, and output assertions for a stored graph wait. */
import { expect } from "vitest";
import { createOperationId } from "@relkit/realtime";
import { digest } from "../src/agent-rpc-support.ts";
import { createFixtureClient, appFetch } from "./fixture-client.js";
import { type createGraphResumeFixture, waitForStatus } from "./graph-resume-rpc.fixture.js";

export async function assertRejectedReplies(
  fixture: Awaited<ReturnType<typeof createGraphResumeFixture>>,
  waiting: Awaited<ReturnType<typeof waitForStatus>>,
  threadId: string,
) {
  const { client, app, graph } = fixture;
  const intruder = createFixtureClient({
    baseUrl: "http://relkit.test",
    headers: { "x-relkit-identity-scope": "intruder", "x-relkit-session-epoch": "session" },
    fetch: appFetch(app),
  });
  await expect(
    intruder["relkit.agent.run"]({
      agentId: graph.id,
      threadId,
      operationId: createOperationId(),
      kind: "run",
      resume: true,
      waitingRevision: waiting.waiting.revision,
      payload: false,
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    client["relkit.agent.run"]({
      agentId: graph.id,
      threadId,
      operationId: createOperationId(),
      kind: "run",
      resume: true,
      waitingRevision: waiting.waiting.revision,
      payload: "yes",
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect((await client["relkit.agent.load"]({ agentId: graph.id, threadId })).thread.status).toBe(
    "waiting",
  );
  await expect(
    client["relkit.agent.run"]({
      agentId: graph.id,
      threadId,
      operationId: createOperationId(),
      kind: "run",
      resume: true,
      waitingRevision: "1",
      payload: false,
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
}

export async function assertSuccessfulReply(
  fixture: Awaited<ReturnType<typeof createGraphResumeFixture>>,
  waiting: Awaited<ReturnType<typeof waitForStatus>>,
  threadId: string,
) {
  const { client, graph, readEntries } = fixture;
  const resumeOperationId = createOperationId();
  const resumeRequest = {
    agentId: graph.id,
    threadId,
    operationId: resumeOperationId,
    kind: "run",
    resume: true,
    waitingRevision: waiting.waiting.revision,
    payload: false,
    requestDigest: digest({ payload: false, waitingRevision: waiting.waiting.revision }),
  };
  const resumed = await client["relkit.agent.run"](resumeRequest);
  expect(resumed).not.toHaveProperty("waitingRevision");
  expect(resumed).not.toHaveProperty("interruptSetDigest");
  const finished = await waitForStatus(client, graph.id, threadId, "idle");
  expect(finished.currentRuns.map((run: { status: string }) => run.status)).toEqual([
    "waiting",
    "succeeded",
  ]);
  expect(await client["relkit.agent.run"](resumeRequest)).toMatchObject({
    runId: resumed.runId,
    duplicate: true,
  });
  await expect(
    client["relkit.agent.run"]({
      ...resumeRequest,
      waitingRevision: "stale",
      requestDigest: digest({ payload: false, waitingRevision: "stale" }),
    }),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  const entries = readEntries();
  expect(entries).toBe(2);
}
