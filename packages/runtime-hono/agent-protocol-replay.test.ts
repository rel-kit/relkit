import { EventSchemas, EventType } from "@ag-ui/core";
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defineAgent,
  type AgentExecutionEvent,
  type AgentStateProvider,
  type ThreadSnapshot,
} from "@relkit/agents";
import type { RegistrationPlan } from "@relkit/graph";
import { createLocalAgentStateProvider } from "@relkit/providers-local";
import { createOperationId } from "@relkit/realtime";
import {
  AGENT_CAPABILITY_HEADER,
  AGENT_CAPABILITY_VALUE,
  AGENT_STREAM_VERSION,
} from "@relkit/contracts";
import { z } from "@relkit/schema";
import { createApp, type RuntimeManifest } from "./src/index.ts";
import { agUiFrames } from "./src/agent-protocol-encoding.ts";
import { snapshotFrames } from "./src/agent-protocol-frame-state.ts";
import { runtimeCohort } from "./test-cohort.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true }))));

test("AG-UI preserves canonical state, nested, and custom events across cursor replay", async () => {
  let executions = 0;
  const fixture = await protocolFixture(async (request) => {
    executions += 1;
    const signal = request.signal ?? new AbortController().signal;
    for (const event of canonicalEvents()) {
      await request.trigger?.contentSink?.emitEvent?.(event, signal);
    }
    return `reply:${String(request.input)}`;
  });
  const operationId = createOperationId();
  const initial = await fixture.app.request(fixture.url, {
    method: "POST",
    headers: fixture.headers(operationId),
    body: fixture.body,
  });
  const frames = parseSse(await initial.text());
  expect(frames.map(({ data }) => EventSchemas.parse(data).type)).toEqual([
    EventType.RUN_STARTED,
    EventType.STATE_SNAPSHOT,
    EventType.CUSTOM,
    EventType.CUSTOM,
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.TEXT_MESSAGE_END,
    EventType.RUN_FINISHED,
  ]);
  expect(frames[1]?.data).toMatchObject({
    type: EventType.STATE_SNAPSHOT,
    snapshot: { todos: [{ content: "Inspect", status: "in_progress" }] },
    metadata: {
      relkit: {
        protocol: "relkit.agent-event",
        version: AGENT_STREAM_VERSION,
        eventId: expect.any(String),
        recordId: expect.any(String),
        runId: expect.any(String),
        kind: "values",
      },
    },
  });
  expect(frames[2]?.data).toMatchObject({
    type: EventType.CUSTOM,
    name: "relkit.execution",
    value: { kind: "tasks", scope: ["tools:delegate"], agent: "researcher" },
  });
  expect(frames[3]?.data).toMatchObject({
    type: EventType.CUSTOM,
    name: "orders.notice",
    value: { kind: "custom", value: { name: "orders.notice", status: "ready" } },
  });
  const stateCursor = frames[1]?.id;
  expect(stateCursor).toBeString();

  const replay = await fixture.app.request(fixture.url, {
    method: "POST",
    headers: { ...fixture.headers(operationId), "last-event-id": stateCursor! },
    body: fixture.body,
  });
  const replayed = parseSse(await replay.text());
  expect(replayed.map(({ data }) => (data as { type: string }).type)).toEqual([
    EventType.CUSTOM,
    EventType.CUSTOM,
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.TEXT_MESSAGE_END,
    EventType.RUN_FINISHED,
  ]);
  expect(replayed.every(({ id }) => id === undefined || id !== stateCursor)).toBe(true);
  expect(executions).toBe(1);

  const invalid = await fixture.app.request(fixture.url, {
    method: "POST",
    headers: { ...fixture.headers(createOperationId()), "last-event-id": "not-a-cursor" },
    body: fixture.body.replace("protocol-thread", "invalid-cursor-thread"),
  });
  expect(invalid.status).toBe(422);
  expect(executions).toBe(1);
});

test("cancelling the SSE iterator leaves detached execution running", async () => {
  const release = Promise.withResolvers<void>();
  const completed = Promise.withResolvers<void>();
  let executionSignal: AbortSignal | undefined;
  const fixture = await protocolFixture(
    async (request) => {
      executionSignal = request.signal;
      await release.promise;
      return "done";
    },
    (provider) => ({
      ...provider,
      completeRun: async (request) => {
        const receipt = await provider.completeRun(request);
        completed.resolve();
        return receipt;
      },
    }),
  );
  const response = await fixture.app.request(fixture.url, {
    method: "POST",
    headers: fixture.headers(createOperationId()),
    body: fixture.body,
  });
  const reader = response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain("RUN_STARTED");
  await reader.cancel();
  expect(executionSignal?.aborted).toBe(false);
  release.resolve();
  await completed.promise;
  expect(executionSignal?.aborted).toBe(false);
});

test("observe-only AG-UI replays an existing run without accepting another execution", async () => {
  let executions = 0;
  const fixture = await protocolFixture(async (request) => {
    executions += 1;
    for (const event of canonicalEvents()) {
      await request.trigger?.contentSink?.emitEvent?.(event, request.signal);
    }
    return "done";
  });
  const initial = await fixture.app.request(fixture.url, {
    method: "POST",
    headers: fixture.headers(createOperationId()),
    body: fixture.body,
  });
  const initialFrames = parseSse(await initial.text());
  const started = initialFrames[0]?.data as { runId: string };
  const cursor = initialFrames[1]?.id;
  const observed = await fixture.app.request(fixture.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "last-event-id": cursor!,
      "x-relkit-agent-observe": "1",
      [AGENT_CAPABILITY_HEADER]: AGENT_CAPABILITY_VALUE,
      "x-relkit-identity-scope": "viewer",
      "x-relkit-session-epoch": "session",
    },
    body: JSON.stringify({ threadId: "protocol-thread", runId: started.runId }),
  });
  expect(observed.status).toBe(200);
  const frames = parseSse(await observed.text());
  expect(frames.length).toBeGreaterThan(0);
  expect(
    frames.some(({ data }) => {
      if (typeof data !== "object" || data === null) return false;
      const metadata = (data as { metadata?: { relkit?: { observation?: unknown } } }).metadata;
      return metadata?.relkit?.observation !== undefined;
    }),
  ).toBe(true);
  expect(executions).toBe(1);
});

test("AG-UI gap recovery projects root values and nested execution snapshots", () => {
  const snapshot = {
    values: { todos: [{ content: "Recover", status: "pending" }] },
    executions: [
      {
        scope: ["tools:delegate"],
        agent: "researcher",
        values: { phase: "collecting" },
        status: "running",
        lastEventSequence: 7,
      },
    ],
    currentRuns: [{ runId: "run-1", acceptedAt: "2026-01-01T00:00:00.000Z" }],
    currentMessages: [],
    approvals: [],
  } as unknown as ThreadSnapshot;
  const projected = [
    ...snapshotFrames(snapshot, new Set(["run-1"]), new Map(), new Map(), new Map(), true),
  ].flatMap((frame) => [...agUiFrames(frame)] as Record<string, unknown>[]);
  expect(projected).toEqual([
    { type: EventType.STATE_SNAPSHOT, snapshot: snapshot.values },
    {
      type: EventType.CUSTOM,
      name: "relkit.execution-snapshot",
      value: snapshot.executions[0],
    },
  ]);
});

type EngineRequest = Parameters<
  NonNullable<Parameters<typeof createApp>[0]["engine"]>["invoke"]
>[0];

async function protocolFixture(
  invoke: (request: EngineRequest) => Promise<unknown>,
  wrap: (provider: AgentStateProvider) => AgentStateProvider = (provider) => provider,
) {
  const root = await mkdtemp(join(tmpdir(), "relkit-agent-protocol-replay-"));
  roots.push(root);
  const agent = defineAgent({
    id: "support.echo",
    input: z.string(),
    output: z.string(),
    instructions: "Echo.",
    tools: [],
    limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 1_000 },
    stateProfile: "default",
    client: { authorize: () => true },
    chat: { input: "message", output: "answer" },
  });
  const plan = agentPlan();
  const provider = wrap(createLocalAgentStateProvider(root, { pollingMs: 50 }));
  return {
    app: createApp({
      plan,
      manifest: manifest(plan, agent),
      engine: { invoke },
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
    }),
    url: "http://relkit.test/_relkit/v1/agents/support.echo/ag-ui",
    body: JSON.stringify({
      threadId: "protocol-thread",
      runId: "external-run",
      state: {},
      messages: [{ id: "message-1", role: "user", content: "hello" }],
      tools: [],
      context: [],
    }),
    headers: (operationId: string) => ({
      "content-type": "application/json",
      "x-relkit-identity-scope": "viewer",
      "x-relkit-session-epoch": "session",
      "x-relkit-operation-id": operationId,
      [AGENT_CAPABILITY_HEADER]: AGENT_CAPABILITY_VALUE,
    }),
  };
}

function canonicalEvents(): readonly AgentExecutionEvent[] {
  const occurredAt = "2026-01-01T00:00:00.000Z";
  return [
    {
      nativeSequence: 1,
      kind: "values",
      scope: [],
      occurredAt,
      value: { todos: [{ content: "Inspect", status: "in_progress" }] },
    },
    {
      nativeSequence: 2,
      kind: "tasks",
      scope: ["tools:delegate"],
      occurredAt,
      agent: "researcher",
      parent: { kind: "tool", toolCallId: "delegate-1", toolId: "task" },
      value: { id: "child-task", name: "research", status: "started" },
    },
    {
      nativeSequence: 3,
      kind: "custom",
      scope: [],
      occurredAt,
      value: { name: "orders.notice", status: "ready" },
    },
  ];
}

function parseSse(text: string): readonly { readonly id?: string; readonly data: unknown }[] {
  return text
    .trim()
    .split("\n\n")
    .map((block) => {
      const lines = block.split("\n");
      const id = lines.find((line) => line.startsWith("id: "))?.slice(4);
      const data = lines.find((line) => line.startsWith("data: "))?.slice(6);
      if (data === undefined) throw new Error("SSE data is missing.");
      return { ...(id === undefined ? {} : { id }), data: JSON.parse(data) as unknown };
    });
}

function agentPlan(): RegistrationPlan {
  return {
    graphHash: "sha256:agent-protocol-replay",
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
