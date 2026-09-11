import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineAgent } from "@relkit/agents";
import type { RegistrationPlan } from "@relkit/graph";
import { createOperationId } from "@relkit/realtime";
import { z } from "@relkit/schema";
import { createClient, createWebSocketClient } from "@relkit/client";
import { createLocalAgentStateProvider } from "@relkit/providers-local";
import { createApp, type RuntimeManifest } from "./src/index.ts";
import { runtimeCohort } from "./test-cohort.ts";
import { upgradeWebSocket, websocket } from "hono/bun";
import { AGENT_CAPABILITY_HEADER } from "@relkit/contracts";

const roots: string[] = [];
const servers: Bun.Server<unknown>[] = [];
afterEach(async () => {
  servers.splice(0).forEach((server) => server.stop(true));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })));
});

test("agent run acceptance is idempotent and restores its durable thread", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-agent-rpc-"));
  roots.push(root);
  const provider = createLocalAgentStateProvider(root, { pollingMs: 50 });
  const authorizedOperations: string[] = [];
  const agent = defineAgent({
    id: "support.echo",
    input: z.object({ message: z.string() }),
    output: z.object({ answer: z.string() }),
    instructions: "Echo the authorized user message.",
    tools: [],
    limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 1_000 },
    stateProfile: "default",
    client: {
      authorize: (request: { readonly operation: string }) => {
        authorizedOperations.push(request.operation);
        return true;
      },
    },
    chat: { input: "message", output: "answer" },
    controls: ["stop"],
  });
  const plan = agentPlan();
  let executions = 0;
  const histories: unknown[] = [];
  const threadIds: unknown[] = [];
  const engine = {
    invoke: async (request: {
      readonly input: unknown;
      readonly signal?: AbortSignal;
      readonly trigger?: { readonly messages?: unknown };
    }) => {
      executions += 1;
      histories.push(request.trigger?.messages);
      threadIds.push((request.trigger as { readonly threadId?: unknown } | undefined)?.threadId);
      const message = (request.input as { readonly message: string }).message;
      if (message === "hold") {
        await new Promise((resolve, reject) => {
          request.signal?.addEventListener("abort", () => reject(request.signal?.reason), {
            once: true,
          });
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
      return { answer: "hello" };
    },
  };
  const app = createApp({
    plan,
    manifest: manifest(plan, agent),
    engine,
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
      provider: () => provider,
    },
    upgradeWebSocket,
  });
  const client = createClient<any>({
    baseUrl: "http://relkit.test",
    headers: { "x-relkit-identity-scope": "viewer", "x-relkit-session-epoch": "session" },
    fetch: (request, init) => app.fetch(new Request(request, init)),
  });
  const incompatibleClient = createClient<any>({
    baseUrl: "http://relkit.test",
    headers: {
      "x-relkit-identity-scope": "viewer",
      "x-relkit-session-epoch": "session",
      [AGENT_CAPABILITY_HEADER]: "cursor-replay.v1",
    },
    fetch: (request, init) => app.fetch(new Request(request, init)),
  });
  const server = Bun.serve({
    port: 0,
    websocket,
    fetch: (request, bunServer) => app.fetch(request, bunServer),
  });
  servers.push(server);
  const socketClient = createWebSocketClient<any>({
    baseUrl: `http://127.0.0.1:${server.port}`,
  });
  const appB = createApp({
    plan,
    manifest: manifest(plan, agent),
    engine,
    clientIdentity: {
      applicationId: "fixture",
      publicFingerprint: "sha256:public",
      resolve: () => ({ identityScope: "viewer", sessionEpoch: "session" }),
    },
    agentRuntime: {
      applicationId: "fixture",
      environment: "test",
      generationId: "generation-b",
      publicFingerprint: "sha256:public",
      provider: () => provider,
    },
  });
  const clientB = createClient<any>({
    baseUrl: "http://relkit.test",
    headers: { "x-relkit-identity-scope": "viewer", "x-relkit-session-epoch": "session" },
    fetch: (request, init) => appB.fetch(new Request(request, init)),
  });
  const operationId = createOperationId();
  const threadId = "conversation:echo";
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

  const snapshot = await waitForIdle(client, agent.id, first.threadId);
  expect(executions).toBe(1);
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
});

test("generation retirement interrupts its run and a newer generation cannot continue it", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-agent-generation-"));
  roots.push(root);
  const provider = createLocalAgentStateProvider(root, { pollingMs: 50 });
  const agent = defineAgent({
    id: "support.echo",
    input: z.string(),
    output: z.string(),
    instructions: "Echo.",
    tools: [],
    limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 10_000 },
    stateProfile: "default",
    client: { authorize: () => true },
    controls: ["approve"],
  });
  const plan = agentPlan();
  const retired = new AbortController();
  let executions = 0;
  const engine = {
    invoke: async ({ signal }: { readonly signal?: AbortSignal }) => {
      executions += 1;
      if (signal?.aborted) throw signal.reason;
      await new Promise((_, reject) =>
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true }),
      );
    },
  };
  const runtime = (generationId: string, signal?: AbortSignal) => ({
    applicationId: "fixture",
    environment: "test",
    generationId,
    publicFingerprint: "sha256:public",
    ...(signal === undefined ? {} : { signal }),
    provider: () => provider,
  });
  const identity = {
    applicationId: "fixture",
    publicFingerprint: "sha256:public",
    resolve: () => ({ identityScope: "viewer", sessionEpoch: "session" }),
  };
  const headers = { "x-relkit-identity-scope": "viewer", "x-relkit-session-epoch": "session" };
  const appA = createApp({
    plan,
    manifest: manifest(plan, agent),
    engine,
    clientIdentity: identity,
    agentRuntime: runtime("generation-a", retired.signal),
  });
  const appB = createApp({
    plan,
    manifest: manifest(plan, agent),
    engine,
    clientIdentity: identity,
    agentRuntime: runtime("generation-b"),
  });
  const clientA = createClient<any>({
    baseUrl: "http://relkit.test",
    headers,
    fetch: (request, init) => appA.fetch(new Request(request, init)),
  });
  const clientB = createClient<any>({
    baseUrl: "http://relkit.test",
    headers,
    fetch: (request, init) => appB.fetch(new Request(request, init)),
  });
  const accepted = await clientA["relkit.agent.run"]({
    agentId: agent.id,
    threadId: "generation:retirement",
    operationId: createOperationId(),
    kind: "run",
    payload: "hold",
  });
  retired.abort();
  const interrupted = await waitForThreadStatus(
    clientB,
    agent.id,
    accepted.threadId,
    "worker-interrupted",
  );
  expect(interrupted.currentRuns).toMatchObject([
    { runId: accepted.runId, status: "worker-interrupted" },
  ]);
  expect(interrupted.activeRun?.owner.generationId).toBe("generation-a");
  await expect(
    clientB["relkit.agent.control"]({
      agentId: agent.id,
      threadId: accepted.threadId,
      operationId: createOperationId(),
      kind: "approve",
      payload: { decisions: {} },
    }),
  ).rejects.toMatchObject({ code: "GENERATION_UNAVAILABLE" });
  expect(executions).toBe(1);
});

test("a queued follow-up starts one new segment on the reusable thread", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-agent-follow-up-"));
  roots.push(root);
  const provider = createLocalAgentStateProvider(root, { pollingMs: 50 });
  const agent = defineAgent({
    id: "support.echo",
    input: z.string(),
    output: z.string(),
    instructions: "Echo.",
    tools: [],
    limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 1_000 },
    stateProfile: "default",
    client: { authorize: () => true },
    controls: ["follow-up"],
  });
  const plan = agentPlan();
  let release!: () => void;
  const firstMayFinish = new Promise<void>((resolve) => {
    release = resolve;
  });
  const inputs: unknown[] = [];
  const app = createApp({
    plan,
    manifest: manifest(plan, agent),
    engine: {
      invoke: async ({ input }: { readonly input: unknown }) => {
        inputs.push(input);
        if (inputs.length === 1) await firstMayFinish;
        return `reply:${String(input)}`;
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
  const first = await client["relkit.agent.run"]({
    agentId: agent.id,
    threadId: "conversation:follow-up",
    operationId: createOperationId(),
    kind: "run",
    payload: "first",
  });
  await client["relkit.agent.control"]({
    agentId: agent.id,
    threadId: first.threadId,
    operationId: createOperationId(),
    kind: "follow-up",
    payload: "second",
  });
  release();
  const snapshot = await waitForRunCount(client, agent.id, first.threadId, 2);
  expect(inputs).toEqual(["first", "second"]);
  expect(snapshot.thread.status).toBe("idle");
  expect(snapshot.currentRuns.map((run: { status: string }) => run.status)).toEqual([
    "succeeded",
    "succeeded",
  ]);
  expect(snapshot.controls).toMatchObject([{ status: "applied", effect: "confirmed" }]);
});

async function waitForIdle(client: any, agentId: string, threadId: string): Promise<any> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const snapshot = await client["relkit.agent.load"]({ agentId, threadId });
    if (snapshot.thread.status === "idle") return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Agent did not settle.");
}

async function waitForThreadStatus(
  client: any,
  agentId: string,
  threadId: string,
  status: string,
): Promise<any> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const snapshot = await client["relkit.agent.load"]({ agentId, threadId });
    if (snapshot.thread.status === status) return snapshot;
    await Bun.sleep(10);
  }
  throw new Error(`Agent did not reach ${status}.`);
}

async function waitForRunCount(
  client: any,
  agentId: string,
  threadId: string,
  count: number,
): Promise<any> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const snapshot = await client["relkit.agent.load"]({ agentId, threadId });
    if (snapshot.thread.status === "idle" && snapshot.currentRuns.length === count) return snapshot;
    await Bun.sleep(10);
  }
  throw new Error(`Agent did not settle ${count} runs.`);
}

function agentPlan(): RegistrationPlan {
  return {
    graphHash: "sha256:agent",
    functions: [],
    httpTriggers: [],
    queues: [],
    schedules: [],
    eventTriggers: [],
    buckets: [],
    caches: [],
    tools: [],
    channels: [],
    agents: [
      {
        kind: "agent",
        id: "support.echo",
        source: { file: "agent.ts", line: 1, column: 1 },
        input: {},
        output: {},
        instructions: "redacted",
        toolIds: [],
        limits: {},
        generatedFunction: { functionId: "relkit.agent.support.echo.invoke" },
        profile: "default",
        stateProfile: "default",
        client: "protected",
        chat: { input: "message", output: "answer" },
        controls: ["stop", "approve", "follow-up"],
      },
    ],
    middlewares: [],
  };
}

function manifest(plan: RegistrationPlan, agent: unknown): RuntimeManifest {
  return {
    ...runtimeCohort(plan.graphHash),
    functions: {},
    agents: { "support.echo": agent },
    middleware: {},
    requestTransforms: {},
  };
}
