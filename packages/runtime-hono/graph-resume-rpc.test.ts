import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command, END, MemorySaver, START, StateSchema, interrupt } from "@langchain/langgraph";
import { createClient } from "@relkit/client";
import { defineGraph, defineGraphNode, invokeAgent } from "@relkit/agents";
import type { RegistrationPlan } from "@relkit/graph";
import { createLocalAgentStateProvider } from "@relkit/providers-local";
import { createOperationId } from "@relkit/realtime";
import { z } from "@relkit/schema";
import { createApp, type RuntimeManifest } from "./src/index.ts";
import { digest } from "./src/agent-rpc-support.ts";
import { runtimeCohort } from "./test-cohort.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true }))));

test("persists a graph wait and resumes a falsy typed reply on the same thread", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-graph-resume-"));
  roots.push(root);
  const provider = createLocalAgentStateProvider(root, { pollingMs: 50 });
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
      return new Command({ update: { approved: interrupt({ question: "Approve?" }) } });
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
  const plan = graphPlan(graph.workflow);
  const engine = {
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
  const app = createApp({
    plan,
    manifest: {
      ...runtimeCohort(plan.graphHash),
      functions: {},
      agents: { [graph.id]: graph },
    } as RuntimeManifest,
    engine,
    clientIdentity: {
      applicationId: "fixture",
      publicFingerprint: "sha256:public",
      resolve: ({ request }) => ({
        identityScope: request.headers.get("x-relkit-identity-scope") ?? "anonymous",
        sessionEpoch: request.headers.get("x-relkit-session-epoch") ?? "anonymous",
      }),
    },
    agentRuntime: {
      applicationId: "fixture",
      environment: "test",
      generationId: "generation-a",
      publicFingerprint: "sha256:public",
      provider: () => provider,
    },
  });
  const client = createClient<any>({
    baseUrl: "http://relkit.test",
    headers: { "x-relkit-identity-scope": "viewer", "x-relkit-session-epoch": "session" },
    fetch: (request, init) => app.fetch(new Request(request, init)),
  });
  const threadId = "order:42";
  await client["relkit.agent.run"]({
    agentId: graph.id,
    threadId,
    operationId: createOperationId(),
    kind: "run",
    payload: { orderId: "42" },
  });
  const waiting = await waitForStatus(client, graph.id, threadId, "waiting");
  expect(waiting.waiting).toMatchObject({ response: { type: "boolean" } });
  expect(waiting.waiting.requests[0]).not.toHaveProperty("id");
  const intruder = createClient<any>({
    baseUrl: "http://relkit.test",
    headers: { "x-relkit-identity-scope": "intruder", "x-relkit-session-epoch": "session" },
    fetch: (request, init) => app.fetch(new Request(request, init)),
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
  expect(entries).toBe(2);
});

async function waitForStatus(client: any, agentId: string, threadId: string, status: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const snapshot = await client["relkit.agent.load"]({ agentId, threadId });
      if (snapshot.thread.status === status) return snapshot;
    } catch {
      // The local fixture atomically replaces its state file while the worker journals.
    }
    await Bun.sleep(10);
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
        generatedFunction: { functionId: "relkit.agent.orders.review.invoke" },
        profile: "default",
        stateProfile: "default",
        client: "protected",
        execution: "graph",
        workflow: workflow as never,
      },
    ],
  };
}
