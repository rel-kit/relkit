/** Terminal and continuation acknowledgement faults settle accepted graph segments once. */
import { expect, test } from "vitest";

import { createLocalAgentStateProvider } from "@relkit/providers-local";
import { createOperationId } from "@relkit/realtime";

import { trackFixtureProvider } from "./fixture-lifetime.js";
import { createFixture, runtimeClient } from "./graph-boundary-runtime.fixture.js";
import { faultProvider } from "./graph-boundary-faults.fixture.js";
import { graphPlan } from "./graph-boundary-graph.fixture.js";
import {
  start,
  resume,
  waitForStatus,
  recordKinds,
  isTerminal,
  contextual,
} from "./graph-boundary-support.fixture.js";

test.each(["before", "after"] as const)(
  "terminal completion %s fault leaves one terminal record",
  async (phase) => {
    const terminal = await createFixture({ providerFault: ["completeRun", phase] });
    const threadId = `terminal:${phase}`;
    await start(terminal.client, terminal.graph.id, threadId);
    const waiting = await waitForStatus(terminal.client, terminal.graph.id, threadId, "waiting");
    await contextual(
      `resume RPC (${phase})`,
      resume(terminal.client, terminal.graph.id, threadId, waiting.waiting.revision),
    );
    const snapshot = await contextual(
      `terminal observation (${phase})`,
      waitForStatus(terminal.client, terminal.graph.id, threadId, "idle"),
    );
    const kinds = await recordKinds(terminal.provider, snapshot, terminal.graph.id);
    expect(kinds.filter((kind) => kind === "terminal")).toHaveLength(1);
  },
);

test.each(["before", "after"] as const)(
  "resume engine %s fault settles its continuation exactly once",
  async (phase) => {
    const fixture = await createFixture();
    const threadId = `resume:failure:${phase}`;
    await start(fixture.client, fixture.graph.id, threadId);
    const waiting = await waitForStatus(fixture.client, fixture.graph.id, threadId, "waiting");
    const restarted = runtimeClient(
      fixture.graph,
      graphPlan(fixture.graph.workflow),
      trackFixtureProvider(createLocalAgentStateProvider(fixture.root, { pollingMs: 50 })),
      "generation-b",
      phase,
    );
    await resume(restarted, fixture.graph.id, threadId, waiting.waiting.revision);
    const failed = await waitForStatus(restarted, fixture.graph.id, threadId, "idle");
    expect(failed.waiting).toBeUndefined();
    expect(failed.currentRuns.map((run: { status: string }) => run.status)).toEqual([
      "waiting",
      "failed",
    ]);
    expect(
      (await recordKinds(fixture.provider, failed, fixture.graph.id)).filter(isTerminal),
    ).toEqual(["terminal"]);
    expect(fixture.entries).toEqual(
      phase === "before" ? { review: 1, finish: 0 } : { review: 2, finish: 1 },
    );
  },
);

test("retry after a committed continuation acknowledgement starts the accepted segment once", async () => {
  const fixture = await createFixture();
  const threadId = "resume:lost-ack";
  await start(fixture.client, fixture.graph.id, threadId);
  const waiting = await waitForStatus(fixture.client, fixture.graph.id, threadId, "waiting");
  const restartedProvider = faultProvider(
    trackFixtureProvider(createLocalAgentStateProvider(fixture.root, { pollingMs: 50 })),
    "admitContinuation",
    "after",
  );
  const restarted = runtimeClient(
    fixture.graph,
    graphPlan(fixture.graph.workflow),
    restartedProvider,
    "generation-b",
  );
  const operationId = createOperationId();
  await expect(
    resume(restarted, fixture.graph.id, threadId, waiting.waiting.revision, operationId),
  ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  const retry = await resume(
    restarted,
    fixture.graph.id,
    threadId,
    waiting.waiting.revision,
    operationId,
  );
  expect(retry).toMatchObject({ duplicate: true });
  const finished = await waitForStatus(restarted, fixture.graph.id, threadId, "idle");
  expect(finished.currentRuns.map((run: { status: string }) => run.status)).toEqual([
    "waiting",
    "succeeded",
  ]);
  expect(finished.currentRuns[1].runId).toBe(retry.runId);
  expect(
    finished.currentMessages.filter((message: { role: string }) => message.role === "assistant"),
  ).toHaveLength(1);
  expect(
    (await recordKinds(fixture.provider, finished, fixture.graph.id)).filter(isTerminal),
  ).toEqual(["terminal"]);
  expect(fixture.entries).toEqual({ review: 2, finish: 1 });
});
