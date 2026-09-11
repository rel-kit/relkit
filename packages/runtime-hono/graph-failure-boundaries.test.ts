import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command, END, MemorySaver, START, StateSchema, interrupt } from "@langchain/langgraph";
import {
  defineGraph,
  defineGraphNode,
  invokeAgent,
  type AgentStateProvider,
  type ExecutionClaim,
} from "@relkit/agents";
import { createClient } from "@relkit/client";
import type { RegistrationPlan } from "@relkit/graph";
import { createLocalAgentStateProvider } from "@relkit/providers-local";
import { createOperationId } from "@relkit/realtime";
import { z } from "@relkit/schema";
import { createApp, type RuntimeManifest } from "./src/index.ts";
import { agentLimits, digest, encodedBytes } from "./src/agent-rpc-support.ts";
import { runtimeCohort } from "./test-cohort.ts";

const roots: string[] = [];
afterAll(async () =>
  Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))),
);

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
      createLocalAgentStateProvider(fixture.root, { pollingMs: 50 }),
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
    createLocalAgentStateProvider(fixture.root, { pollingMs: 50 }),
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

type ProviderMethod = "appendJournal" | "completeRun" | "suspendRun" | "admitContinuation";
type Phase = "before" | "after";

async function createFixture(
  options: {
    saver?: MemorySaver;
    providerFault?: readonly [ProviderMethod, Phase];
    claims?: ExecutionClaim[];
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), "relkit-graph-boundary-"));
  roots.push(root);
  const base = createLocalAgentStateProvider(root, { pollingMs: 50 });
  let provider = options.providerFault
    ? faultProvider(base, options.providerFault[0], options.providerFault[1])
    : base;
  if (options.claims !== undefined) provider = captureClaims(provider, options.claims);
  const entries = { review: 0, finish: 0 };
  const graph = reviewGraph(options.saver ?? new MemorySaver(), entries);
  return {
    root,
    graph,
    entries,
    provider: base,
    client: runtimeClient(graph, graphPlan(graph.workflow), provider, "generation-a"),
  };
}

function faultSaver(saver: MemorySaver, phase: Phase): MemorySaver {
  let armed = true;
  return new Proxy(saver, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      const invoke = value.bind(target);
      if (key !== "put") return invoke;
      return async (...args: unknown[]) => {
        if (armed && phase === "before") {
          armed = false;
          throw new Error("checkpoint before");
        }
        const result = await invoke(...args);
        if (armed && phase === "after") {
          armed = false;
          throw new Error("checkpoint after");
        }
        return result;
      };
    },
  });
}

function faultProvider(
  provider: AgentStateProvider,
  method: ProviderMethod,
  phase: Phase,
): AgentStateProvider {
  let armed = true;
  const invoke = (provider[method] as (...args: any[]) => Promise<unknown>).bind(provider);
  return {
    ...provider,
    [method]: async (...args: any[]) => {
      if (armed && phase === "before") {
        armed = false;
        throw new Error(`${method} before`);
      }
      const result = await invoke(...args);
      if (armed && phase === "after") {
        armed = false;
        throw new Error(`${method} after`);
      }
      return result;
    },
  } as AgentStateProvider;
}

function captureClaims(provider: AgentStateProvider, claims: ExecutionClaim[]): AgentStateProvider {
  return {
    ...provider,
    claimRun: async (request) => {
      const claim = await provider.claimRun(request);
      claims.push(claim);
      return claim;
    },
  };
}

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
    id: "orders.boundary",
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
  provider: AgentStateProvider,
  generationId: string,
  resumeFault?: Phase,
) {
  const app = createApp({
    plan,
    manifest: {
      ...runtimeCohort(plan.graphHash),
      functions: {},
      agents: { [graph.id]: graph },
    } as RuntimeManifest,
    engine: {
      invoke: async (request: any) => {
        if (resumeFault === "before" && request.trigger.resume)
          throw new Error("resume engine before");
        const output = await invokeAgent({
          agent: graph,
          input: request.input,
          threadId: request.trigger.threadId,
          resume: request.trigger.resume,
          contentSink: request.trigger.contentSink,
          tools: {},
          engine: { invoke: () => Promise.reject(new Error("unused")) },
        });
        if (resumeFault === "after" && request.trigger.resume)
          throw new Error("resume engine after");
        return output;
      },
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

function start(client: any, agentId: string, threadId: string) {
  return client["relkit.agent.run"]({
    agentId,
    threadId,
    operationId: createOperationId(),
    kind: "run",
    payload: { orderId: "42" },
  });
}

function resume(
  client: any,
  agentId: string,
  threadId: string,
  waitingRevision: string,
  operationId = createOperationId(),
) {
  return client["relkit.agent.run"]({
    agentId,
    threadId,
    operationId,
    kind: "run",
    resume: true,
    waitingRevision,
    payload: true,
  });
}

async function waitForStatus(client: any, agentId: string, threadId: string, status: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const snapshot = await client["relkit.agent.load"]({ agentId, threadId });
      if (snapshot.thread.status === status) return snapshot;
    } catch (cause) {
      lastError = cause;
    }
    await Bun.sleep(10);
  }
  throw new Error(`Agent did not reach ${status}.`, { cause: lastError });
}

async function recordKinds(provider: AgentStateProvider, snapshot: any, agentId: string) {
  const page = await provider.readJournal({
    ...scope(snapshot, agentId),
    threadId: snapshot.thread.threadId,
    after: { ...snapshot.checkpoint, sequence: "0" },
    limit: 100,
    maxEncodedBytes: 1024 * 1024,
  });
  return page.records.map((record) => record.kind);
}

function scope(snapshot: any, agentId: string) {
  return {
    applicationId: "fixture",
    environment: "test",
    profile: "default",
    providerEpoch: snapshot.providerEpoch,
    agentId,
    ownerScope: "viewer",
    authorizationGrantId: digest({
      identity: { identityScope: "viewer", sessionEpoch: "session" },
      agentId,
    }),
  };
}

function isTerminal(kind: string) {
  return kind === "terminal";
}

function isInterruption(kind: string) {
  return kind === "interruption";
}

async function contextual<T>(label: string, operation: Promise<T>): Promise<T> {
  try {
    return await operation;
  } catch (cause) {
    throw new Error(label, { cause });
  }
}

function graphPlan(workflow: unknown): RegistrationPlan {
  return {
    graphHash: "sha256:graph-boundary",
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
        id: "orders.boundary",
        source: { file: "graph.ts", line: 1, column: 1 },
        input: {},
        output: {},
        instructions: "",
        toolIds: [],
        limits: {},
        generatedFunction: { functionId: "relkit.agent.orders.boundary.invoke" },
        profile: "default",
        stateProfile: "default",
        client: "protected",
        execution: "graph",
        workflow: workflow as never,
      },
    ],
  };
}
