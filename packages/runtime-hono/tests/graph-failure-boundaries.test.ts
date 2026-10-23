/** Checkpoint, waiting-publication, and journal faults preserve committed graph boundaries. */
import { expect, test } from "vitest";
import { MemorySaver } from "@langchain/langgraph";
import { type ExecutionClaim } from "@relkit/agents";

import { createOperationId } from "@relkit/realtime";
import { agentLimits, encodedBytes } from "../src/agent-rpc-support.ts";

import { createFixture } from "./graph-boundary-runtime.fixture.js";
import { faultSaver } from "./graph-boundary-faults.fixture.js";

import {
  start,
  waitForStatus,
  recordKinds,
  scope,
  isInterruption,
} from "./graph-boundary-support.fixture.js";

test.each(["before", "after"] as const)(
  "checkpoint %s failure cannot publish a waiting contract",
  async (phase) => {
    const fixture = await createFixture({ saver: faultSaver(new MemorySaver(), phase) });
    await start(fixture.client, fixture.graph.id, `checkpoint:${phase}`);
    const snapshot = await waitForStatus(
      fixture.client,
      fixture.graph.id,
      `checkpoint:${phase}`,
      "idle",
    );
    expect(snapshot.waiting).toBeUndefined();
    expect(snapshot.currentRuns).toMatchObject([{ status: "failed" }]);
    expect(await recordKinds(fixture.provider, snapshot, fixture.graph.id)).not.toContain(
      "interruption",
    );
  },
);

test("waiting publication is absent before commit and survives a lost acknowledgement", async () => {
  const before = await createFixture({ providerFault: ["suspendRun", "before"] });
  await start(before.client, before.graph.id, "waiting:before");
  const failed = await waitForStatus(before.client, before.graph.id, "waiting:before", "idle");
  expect(failed.waiting).toBeUndefined();
  expect(failed.currentRuns).toMatchObject([{ status: "failed" }]);

  const claims: ExecutionClaim[] = [];
  const after = await createFixture({
    providerFault: ["suspendRun", "after"],
    claims,
  });
  await start(after.client, after.graph.id, "waiting:after");
  const waiting = await waitForStatus(after.client, after.graph.id, "waiting:after", "waiting");
  expect(waiting.waiting).toMatchObject({ revision: waiting.thread.revision });
  expect(
    (await recordKinds(after.provider, waiting, after.graph.id)).filter(isInterruption),
  ).toEqual(["interruption"]);
  await expect(
    after.provider.appendJournal({
      ...scope(waiting, after.graph.id),
      threadId: waiting.thread.threadId,
      runId: waiting.currentRuns[0].runId,
      claim: claims[0]!,
      operationId: createOperationId(),
      semanticDigest: "stale",
      record: {
        recordId: crypto.randomUUID(),
        runId: waiting.currentRuns[0].runId,
        kind: "progress",
        publicValue: null,
        encodedBytes: encodedBytes(null),
        createdAt: new Date().toISOString(),
      },
      limits: agentLimits,
    }),
  ).rejects.toMatchObject({ code: "CLAIM_LOST" });
});

test.each(["before", "after"] as const)(
  "journal append %s fault preserves exactly the committed records",
  async (phase) => {
    const fixture = await createFixture({ providerFault: ["appendJournal", phase] });
    await start(fixture.client, fixture.graph.id, `journal:${phase}`);
    const failed = await waitForStatus(
      fixture.client,
      fixture.graph.id,
      `journal:${phase}`,
      "idle",
    );
    const kinds = await recordKinds(fixture.provider, failed, fixture.graph.id);
    expect(kinds.filter((kind) => kind === "message")).toHaveLength(phase === "after" ? 1 : 0);
    expect(kinds.filter((kind) => kind === "terminal")).toHaveLength(1);
  },
);
