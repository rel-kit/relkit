import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command, END, MemorySaver, START, StateSchema, interrupt } from "@langchain/langgraph";
import { defineGraph, defineGraphNode, invokeAgent } from "@relkit/agents";
import { createClient } from "@relkit/client";
import type { RegistrationPlan } from "@relkit/graph";
import { createLocalAgentStateProvider } from "@relkit/providers-local";
import { createOperationId } from "@relkit/realtime";
import { z } from "@relkit/schema";
import { createApp, type RuntimeManifest } from "./src/index.ts";
import { waitForAgentRun } from "./src/agent-run-tasks.ts";
import { digest } from "./src/agent-rpc-support.ts";
import { runtimeCohort } from "./test-cohort.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true }))));

test("a restarted runtime admits one competing graph resume and one terminal output", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-graph-restart-"));
  roots.push(root);
  const checkpointer = new MemorySaver();
  const entries = { review: 0, finish: 0 };
  const graphA = reviewGraph(checkpointer, entries);
  const plan = graphPlan(graphA.workflow);
  const clientA = runtimeClient(
    graphA,
    plan,
    createLocalAgentStateProvider(root, { pollingMs: 50 }),
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

  const providerB = createLocalAgentStateProvider(root, { pollingMs: 50 });
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
      waitingRevision: waitingB.waiting.revision,
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

  const journal = await providerB.readJournal({
    applicationId: "fixture",
    environment: "test",
    profile: "default",
    providerEpoch: finished.providerEpoch,
    agentId: graphB.id,
    ownerScope: "viewer",
    authorizationGrantId: digest({
      identity: { identityScope: "viewer", sessionEpoch: "session" },
      agentId: graphB.id,
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
});

function reviewGraph(checkpointer: MemorySaver, entries: { review: number; finish: number }) {
  const state = new StateSchema({
    orderId: z.string(),
    approved: z.boolean().optional(),
    result: z.string().optional(),
  });
  const review = defineGraphNode({
    id: "review",
    input: z.object({ orderId: z.string() }),
    output: z.object({ approved: z.boolean() }),
    resume: z.boolean(),
    ends: ["finish"] as const,
    handler: () => {
      entries.review += 1;
      const approved = interrupt({ question: "Approve?" }) as boolean;
      return new Command({ update: { approved }, goto: "finish" });
    },
  });
  const finish = defineGraphNode({
    id: "finish",
    input: z.object({ approved: z.boolean() }),
    output: z.object({ result: z.string() }),
    handler: ({ approved }) => {
      entries.finish += 1;
      return { result: approved ? "approved" : "rejected" };
    },
  });
  return defineGraph({
    id: "orders.restart",
    state,
    input: z.object({ orderId: z.string() }),
    output: z.object({ result: z.string() }),
    nodes: [review, finish],
    edges: (edge) => edge.addEdge(START, "review").addEdge("finish", END),
    checkpointer,
    limits: { maxSteps: 5, maxToolCalls: 1, timeoutMs: 2_000 },
    stateProfile: "default",
    client: { authorize: () => true },
  });
}

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
      applicationId: "fixture",
      environment: "test",
      generationId,
      publicFingerprint: "sha256:public",
      provider: () => provider,
    },
  });
  return createClient<any>({
    baseUrl: "http://relkit.test",
    headers: { "x-relkit-identity-scope": "viewer", "x-relkit-session-epoch": "session" },
    fetch: (request, init) => app.fetch(new Request(request, init)),
  });
}

async function waitForStatus(client: any, agentId: string, threadId: string, status: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const snapshot = await client["relkit.agent.load"]({ agentId, threadId });
    if (snapshot.thread.status === status) return snapshot;
    await Bun.sleep(10);
  }
  throw new Error(`Agent did not reach ${status}.`);
}

function graphPlan(workflow: unknown): RegistrationPlan {
  return {
    graphHash: "sha256:graph-restart",
    functions: [],
    httpTriggers: [],
    queues: [],
    schedules: [],
    eventTriggers: [],
    buckets: [],
    caches: [],
    tools: [],
    channels: [],
    middlewares: [],
    agents: [
      {
        kind: "agent",
        id: "orders.restart",
        source: { file: "graph.ts", line: 1, column: 1 },
        input: {},
        output: {},
        instructions: "",
        toolIds: [],
        limits: {},
        generatedFunction: { functionId: "relkit.agent.orders.restart.invoke" },
        profile: "default",
        stateProfile: "default",
        client: "protected",
        execution: "graph",
        workflow: workflow as never,
      },
    ],
  };
}
