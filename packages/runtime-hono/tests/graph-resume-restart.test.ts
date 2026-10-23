/** A recreated runtime competes for one stored graph continuation and publishes one terminal result. */
import { reviewGraph, graphPlan } from "./graph-restart-graph.fixture.js";
import { trackFixtureRun, trackFixtureProvider, joinFixtureRuns } from "./fixture-lifetime.js";
import { createFixtureClient, appFetch } from "./fixture-client.js";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemorySaver } from "@langchain/langgraph";
import { invokeAgent } from "@relkit/langchain";

import type { RegistrationPlan } from "@relkit/graph";
import { createLocalAgentStateProvider } from "@relkit/providers-local";
import { createOperationId } from "@relkit/realtime";

import { createApp, type RuntimeManifest } from "../src/index.ts";
import { waitForAgentRun } from "../src/agent-run-tasks.ts";
import { digest } from "../src/agent-rpc-support.ts";
import { runtimeCohort } from "./test-cohort.ts";

const roots: string[] = [];
afterEach(async () => {
  await joinFixtureRuns();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })));
});

test("a restarted runtime admits one competing graph resume and one terminal output", async () => {
  const { root, checkpointer, entries, plan, graphA, threadId, waitingA } =
    await startWaitingGraph();

  const providerB = trackFixtureProvider(createLocalAgentStateProvider(root, { pollingMs: 50 }));
  const graphB = reviewGraph(checkpointer, entries);
  const clientB = runtimeClient(graphB, plan, providerB, "generation-b");
  const waitingB = await clientB["relkit.agent.load"]({ agentId: graphB.id, threadId });
  expect(waitingB.waiting).toEqual(waitingA.waiting);

  const resume = () =>
    clientB["relkit.agent.run"]({
      agentId: graphB.id,
      threadId,
      operationId: createOperationId(),
      kind: "run",
      resume: true,
      waitingRevision: waitingB.waiting!.revision,
      payload: true,
    });
  const competitors = await Promise.allSettled([resume(), resume()]);
  const accepted = competitors.filter((result) => result.status === "fulfilled");
  expect(accepted).toHaveLength(1);
  expect(competitors.filter((result) => result.status === "rejected")).toHaveLength(1);

  const finished = await waitForStatus(clientB, graphB.id, threadId, "idle");
  await waitForAgentRun(accepted[0]!.value.runId);
  expect(finished.currentRuns.map((run: { status: string }) => run.status)).toEqual([
    "waiting",
    "succeeded",
  ]);
  expect(entries).toEqual({ review: 2, finish: 1 });
  expect(finished.currentMessages).toHaveLength(2);
  expect(finished.currentMessages[1]).toMatchObject({
    role: "assistant",
    parts: [{ kind: "text", text: '{"result":"approved"}', state: "complete" }],
  });

  await assertRestartJournal(providerB, finished, graphB.id, threadId);
});

function runtimeClient(
  graph: ReturnType<typeof reviewGraph>,
  plan: RegistrationPlan,
  provider: ReturnType<typeof createLocalAgentStateProvider>,
  generationId: string,
) {
  const app = createApp({
    plan,
    manifest: {
      ...runtimeCohort(plan.graphHash),
      functions: {},
      middleware: {},
      requestTransforms: {},
      agents: { [graph.id]: graph },
    } as RuntimeManifest,
    engine: {
      invoke: (request: any) =>
        invokeAgent({
          agent: graph,
          input: request.input,
          threadId: request.trigger.threadId,
          resume: request.trigger.resume,
          contentSink: request.trigger.contentSink,
          tools: {},
          engine: { invoke: () => Promise.reject(new Error("unused")) },
        }),
    },
    clientIdentity: {
      applicationId: "fixture",
      publicFingerprint: "sha256:public",
      resolve: () => ({ identityScope: "viewer", sessionEpoch: "session" }),
    },
    agentRuntime: {
      track: trackFixtureRun,
      applicationId: "fixture",
      environment: "test",
      generationId,
      publicFingerprint: "sha256:public",
      provider: () => provider,
    },
  });
  return createFixtureClient({
    baseUrl: "http://relkit.test",
    headers: { "x-relkit-identity-scope": "viewer", "x-relkit-session-epoch": "session" },
    fetch: appFetch(app),
  });
}

async function waitForStatus(client: any, agentId: string, threadId: string, status: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const snapshot = await client["relkit.agent.load"]({ agentId, threadId });
    if (snapshot.thread.status === status) return snapshot;
    await sleep(10);
  }
  throw new Error(`Agent did not reach ${status}.`);
}

async function startWaitingGraph() {
  const root = await mkdtemp(join(tmpdir(), "relkit-graph-restart-"));
  roots.push(root);
  const checkpointer = new MemorySaver();
  const entries = { review: 0, finish: 0 };
  const graphA = reviewGraph(checkpointer, entries);
  const plan = graphPlan(graphA.workflow);
  const clientA = runtimeClient(
    graphA,
    plan,
    trackFixtureProvider(createLocalAgentStateProvider(root, { pollingMs: 50 })),
    "generation-a",
  );
  const threadId = "order:restart";

  const initial = await clientA["relkit.agent.run"]({
    agentId: graphA.id,
    threadId,
    operationId: createOperationId(),
    kind: "run",
    payload: { orderId: "42" },
  });
  const waitingA = await waitForStatus(clientA, graphA.id, threadId, "waiting");
  await waitForAgentRun(initial.runId);
  return { root, checkpointer, entries, plan, graphA, threadId, waitingA };
}

async function assertRestartJournal(
  providerB: ReturnType<typeof createLocalAgentStateProvider>,
  finished: Awaited<ReturnType<typeof waitForStatus>>,
  agentId: string,
  threadId: string,
) {
  const journal = await providerB.readJournal({
    applicationId: "fixture",
    environment: "test",
    profile: "default",
    providerEpoch: finished.providerEpoch,
    agentId: agentId,
    ownerScope: "viewer",
    identityScope: "viewer",
    sessionEpoch: "session",
    authorizationGrantId: digest({
      identity: { identityScope: "viewer", sessionEpoch: "session" },
      agentId: agentId,
    }),
    threadId,
    after: { ...finished.checkpoint, sequence: "0" },
    limit: 100,
    maxEncodedBytes: 1024 * 1024,
  });
  expect(journal.records.filter((record) => record.kind === "terminal")).toEqual([
    expect.objectContaining({
      publicValue: expect.objectContaining({ output: { result: "approved" } }),
    }),
  ]);
}
