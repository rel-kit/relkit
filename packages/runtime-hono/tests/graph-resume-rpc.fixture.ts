/** Constructs the real graph/provider RPC fixture and polls its persisted status until settlement. */
import { trackFixtureRun, trackFixtureProvider, joinFixtureRuns } from "./fixture-lifetime.js";
import { createFixtureClient, appFetch } from "./fixture-client.js";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command, END, MemorySaver, START, StateSchema, interrupt } from "@langchain/langgraph";

import { defineGraph, defineGraphNode, invokeAgent } from "@relkit/langchain";
import type { RegistrationPlan } from "@relkit/graph";
import { createLocalAgentStateProvider } from "@relkit/providers-local";

import { z } from "@relkit/schema";
import { createApp, type RuntimeManifest } from "../src/index.ts";

import { runtimeCohort } from "./test-cohort.ts";

const roots: string[] = [];
afterEach(async () => {
  await joinFixtureRuns();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })));
});

export async function createGraphResumeFixture() {
  const root = await mkdtemp(join(tmpdir(), "relkit-graph-resume-"));
  roots.push(root);
  const provider = trackFixtureProvider(createLocalAgentStateProvider(root, { pollingMs: 50 }));
  const native = singleReviewGraph();
  const { graph } = native;
  const plan = graphPlan(graph.workflow);
  const app = createApp({
    plan,
    manifest: {
      ...runtimeCohort(plan.graphHash),
      functions: {},
      middleware: {},
      requestTransforms: {},
      agents: { [graph.id]: graph },
    } as RuntimeManifest,
    engine: graphResumeEngine(graph),
    clientIdentity: {
      applicationId: "fixture",
      publicFingerprint: "sha256:public",
      resolve: ({ request }) => ({
        identityScope: request.headers.get("x-relkit-identity-scope") ?? "anonymous",
        sessionEpoch: request.headers.get("x-relkit-session-epoch") ?? "anonymous",
      }),
    },
    agentRuntime: {
      track: trackFixtureRun,
      applicationId: "fixture",
      environment: "test",
      generationId: "generation-a",
      publicFingerprint: "sha256:public",
      provider: () => provider,
    },
  });
  const client = createFixtureClient({
    baseUrl: "http://relkit.test",
    headers: { "x-relkit-identity-scope": "viewer", "x-relkit-session-epoch": "session" },
    fetch: appFetch(app),
  });
  return { client, app, graph, readEntries: native.readEntries };
}

function graphResumeEngine(graph: ReturnType<typeof singleReviewGraph>["graph"]) {
  return {
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
  };
}

function singleReviewGraph() {
  const state = new StateSchema({ orderId: z.string(), approved: z.boolean().optional() });
  let entries = 0;
  const review = defineGraphNode({
    id: "review",
    input: z.object({ orderId: z.string() }),
    output: z.object({ approved: z.boolean() }),
    resume: z.boolean(),
    ends: [END],
    handler: () => {
      entries += 1;
      return new Command<unknown, { approved: boolean }, typeof END>({
        update: { approved: interrupt({ question: "Approve?" }) },
      });
    },
  });
  const graph = defineGraph({
    id: "orders.review",
    state,
    input: z.object({ orderId: z.string() }),
    output: z.object({ approved: z.boolean() }),
    nodes: [review],
    edges: (edge) => edge.addEdge(START, "review").addEdge("review", END),
    checkpointer: new MemorySaver(),
    limits: { maxSteps: 5, maxToolCalls: 1, timeoutMs: 2_000 },
    stateProfile: "default",
    client: { authorize: () => true },
  });
  return { graph, readEntries: () => entries };
}

export async function waitForStatus(
  client: any,
  agentId: string,
  threadId: string,
  status: string,
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const snapshot = await client["relkit.agent.load"]({ agentId, threadId });
      if (snapshot.thread.status === status) return snapshot;
    } catch {
      // The local fixture atomically replaces its state file while the worker journals.
    }
    await sleep(10);
  }
  throw new Error(`Agent did not reach ${status}.`);
}

function graphPlan(workflow: unknown): RegistrationPlan {
  return {
    graphHash: "sha256:graph-resume",
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
        id: "orders.review",
        source: { file: "graph.ts", line: 1, column: 1 },
        input: {},
        output: {},
        instructions: "",
        toolIds: [],
        limits: {},
        generatedFunction: {
          functionId: "relkit.agent.orders.review.invoke",
          generated: true,
          generatedBy: "agent",
          agentId: "orders.review",
        },
        profile: "default",
        stateProfile: "default",
        client: "protected",
        execution: "graph",
        workflow: workflow as never,
      },
    ],
  };
}
