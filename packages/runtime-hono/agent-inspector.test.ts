import { expect, test } from "bun:test";
import type { AgentStateProvider, JournalCheckpoint, JournalRecord } from "@relkit/agents";
import type { RegistrationPlan } from "@relkit/graph";
import { z } from "@relkit/schema";
import { Hono } from "hono";
import { installAgentInspectorEndpoints } from "./src/agent-inspector.ts";
import type { RouteMaterializationOptions } from "./src/materialize-routes.ts";
import { runtimeCohort } from "./test-cohort.ts";

test("Inspector workflow and execution endpoints expose safe structural metadata", async () => {
  const app = new Hono();
  installAgentInspectorEndpoints(app, options(), {});
  const workflow = await app.request("http://relkit.test/_relkit/v1/agents/review/workflow");
  expect(workflow.status).toBe(200);
  expect(await workflow.json()).toMatchObject({
    agentId: "review",
    workflowTopology: { start: "__start__", end: "__end__", registeredNodes: ["review"] },
    resourceDependencies: [{ kind: "agent-state", profile: "default" }],
  });

  const response = await app.request(
    "http://relkit.test/_relkit/v1/runtime/agents/review/executions?threadId=thread-1&mode=history",
    { headers: { "x-relkit-identity-scope": "viewer", "x-relkit-session-epoch": "session" } },
  );
  expect(response.status).toBe(200);
  const text = await response.text();
  expect(text).not.toContain("private-value");
  expect(text).not.toContain("checkpoint");
  const payload = JSON.parse(text) as Record<string, any>;
  expect(payload.runs).toEqual([expect.objectContaining({ runId: "run-1", status: "succeeded" })]);
  expect(payload.executions).toEqual([
    {
      scope: ["graph:review"],
      node: "review",
      status: "succeeded",
      lastEventSequence: 4,
    },
  ]);
  expect(payload.attempts).toEqual([
    expect.objectContaining({ attempt: 1, status: "failed", taskId: "task-1" }),
    expect.objectContaining({ attempt: 2, status: "completed", taskId: "task-1" }),
  ]);
});

test("Inspector agent endpoints retain production bearer protection", async () => {
  const app = new Hono();
  installAgentInspectorEndpoints(app, options(), {
    mode: "production",
    enabled: true,
    bearerToken: "inspector-secret",
  });
  const denied = await app.request("http://relkit.test/_relkit/v1/agents/review/workflow");
  expect(denied.status).toBe(401);
  const accepted = await app.request("http://relkit.test/_relkit/v1/agents/review/workflow", {
    headers: { authorization: "Bearer inspector-secret" },
  });
  expect(accepted.status).toBe(200);
});

function options(): RouteMaterializationOptions {
  const input = z.string();
  const output = z.string();
  return {
    plan: plan(),
    manifest: {
      ...runtimeCohort("sha256:inspector-agent"),
      functions: {},
      middleware: {},
      requestTransforms: {},
      agents: { review: { input, output, client: { authorize: () => true } } },
    },
    engine: { invoke: async () => undefined },
    clientIdentity: {
      applicationId: "fixture",
      publicFingerprint: "sha256:public",
      resolve: () => ({ identityScope: "viewer", sessionEpoch: "session" }),
    },
    agentRuntime: {
      applicationId: "fixture",
      environment: "test",
      generationId: "generation-a",
      publicFingerprint: "sha256:public",
      provider: () => provider(),
    },
  };
}

function plan(): RegistrationPlan {
  return {
    graphHash: "sha256:inspector-agent",
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
        id: "review",
        source: { file: "review.ts", line: 1, column: 1 },
        input: {},
        output: {},
        instructions: "safe",
        toolIds: [],
        limits: {},
        generatedFunction: { functionId: "relkit.agent.review.invoke" },
        profile: "default",
        stateProfile: "default",
        client: "protected",
        execution: "graph",
        workflow: { version: 1, start: "__start__", end: "__end__", nodes: [], edges: [] },
        workflowTopology: {
          start: "__start__",
          end: "__end__",
          registeredNodes: ["review"],
          conditionalRoutes: [],
          dynamicRoutes: [],
          parallelBranches: [],
          joins: [],
          loops: [],
          subgraphs: [],
        },
        resourceDependencies: [{ kind: "agent-state", profile: "default" }],
      },
    ],
  };
}

function provider(): AgentStateProvider {
  const checkpoint = point("4");
  return {
    getEpoch: async () => "epoch-1",
    loadThread: async () => ({
      snapshotId: "snapshot-1",
      thread: {
        threadId: "thread-1",
        agentId: "review",
        ownerScope: "viewer",
        status: "idle",
        revision: "4",
        createdAt: time(0),
        updatedAt: time(4),
      },
      currentRuns: [
        {
          runId: "run-1",
          threadId: "thread-1",
          owner: {},
          operationId: "operation-1",
          status: "succeeded",
          inputDigest: "safe",
          acceptedAt: time(0),
          settledAt: time(4),
        },
      ],
      currentMessages: [],
      approvals: [],
      controls: [],
      activeRun: undefined,
      values: { secret: "private-value" },
      output: "private-value",
      executions: [
        {
          scope: ["graph:review"],
          node: "review",
          values: { secret: "private-value" },
          status: "succeeded",
          lastEventSequence: 4,
        },
      ],
      checkpoint,
      providerEpoch: "epoch-1",
      hasOlderHistory: false,
    }),
    readJournal: async () => ({ records: records(), checkpoint, hasMore: false }),
  } as unknown as AgentStateProvider;
}

function records(): JournalRecord[] {
  return [event(1, "started"), event(2, "failed"), event(3, "started"), event(4, "completed")];
}

function event(sequence: number, status: string): JournalRecord {
  return {
    recordId: `record-${sequence}`,
    runId: "run-1",
    kind: "event",
    encodedBytes: 1,
    checkpoint: point(String(sequence)),
    createdAt: time(sequence),
    publicValue: {
      nativeSequence: sequence,
      kind: "tasks",
      scope: ["graph:review"],
      node: "review",
      occurredAt: time(sequence),
      value: { id: "task-1", name: "review", status },
    },
  };
}

function point(sequence: string): JournalCheckpoint {
  return {
    applicationId: "fixture",
    environment: "test",
    profile: "default",
    providerEpoch: "epoch-1",
    threadId: "thread-1",
    sequence,
  };
}

function time(offset: number): string {
  return `2026-01-01T00:00:0${offset}.000Z`;
}
