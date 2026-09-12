import { EventType } from "@ag-ui/core";
import { oc } from "@orpc/contract";
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, createWebSocketClient } from "@relkit/client";
import {
  defineAgent,
  invokeAgent,
  type AgentContentSink,
  type AgentExecutionEvent,
  type AgentObservation,
  type JournalCheckpoint,
  type ThreadSnapshot,
} from "@relkit/agents";
import type { RegistrationPlan } from "@relkit/graph";
import { createLocalAgentStateProvider } from "@relkit/providers-local";
import { createOperationId } from "@relkit/realtime";
import { z } from "@relkit/schema";
import { AGENT_CAPABILITY_HEADER, AGENT_CAPABILITY_VALUE } from "@relkit/contracts";
import { todoListMiddleware } from "langchain";
import { createTodoTestModel } from "./deepagent-test-model.ts";
import { createApp, type RuntimeManifest } from "./src/index.ts";
import { runtimeCohort } from "./test-cohort.ts";
import { upgradeWebSocket, websocket } from "hono/bun";

const pending = [
  { content: "Find the order", status: "in_progress" },
  { content: "Explain its state", status: "pending" },
] as const;
const progressing = [
  { content: "Find the order", status: "completed" },
  { content: "Explain its state", status: "in_progress" },
] as const;
const completed = [
  { content: "Find the order", status: "completed" },
  { content: "Explain its state", status: "completed" },
] as const;
const expectedStates = [pending, progressing, completed] as const;
const identityHeaders = {
  "x-relkit-identity-scope": "viewer",
  "x-relkit-session-epoch": "session",
};
const networkFetch = globalThis.fetch.bind(globalThis);
const roots: string[] = [];
const servers: Bun.Server<unknown>[] = [];

const clientContract = {
  "relkit.agent.run": oc
    .input(schema<AgentRunInput>())
    .output(
      schema<{ readonly threadId: string; readonly runId: string; readonly duplicate: boolean }>(),
    ),
  "relkit.agent.load": oc
    .input(schema<{ readonly agentId: string; readonly threadId: string }>())
    .output(schema<ThreadSnapshot>()),
  "relkit.agent.observe": oc
    .input(schema<AgentObserveInput>())
    .output(schema<AsyncIterable<AgentObservation>>()),
} as const;

afterEach(async () => {
  servers.splice(0).forEach((server) => server.stop(true));
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

test("native todo values cross HTTP, SSE, and WebSocket before terminal completion", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-native-todo-network-"));
  roots.push(root);
  const provider = createLocalAgentStateProvider(root, { pollingMs: 50 });
  const scripted = createTodoTestModel(expectedStates);
  const agent = defineAgent({
    id: "support.echo",
    input: z.object({ message: z.string() }),
    output: z.object({ answer: z.string() }),
    model: scripted.model,
    instructions: "Track the order with the todo list, then answer.",
    tools: [],
    middleware: [todoListMiddleware()],
    limits: { maxSteps: 5, maxToolCalls: 4, timeoutMs: 10_000 },
    stateProfile: "default",
    client: { authorize: () => true, state: ["todos"] },
    chat: { input: "message", output: "answer" },
  });
  const plan = agentPlan();
  const start = Promise.withResolvers<void>();
  const releases = expectedStates.map(() => Promise.withResolvers<void>());
  let executions = 0;
  const app = createApp({
    plan,
    manifest: manifest(plan, agent),
    engine: {
      invoke: async (request) => {
        executions += 1;
        await start.promise;
        const trigger = request.trigger as {
          readonly threadId: string;
          readonly contentSink: AgentContentSink;
        };
        const sink = trigger.contentSink;
        const emitEvent = sink.emitEvent;
        if (emitEvent === undefined) throw new Error("Agent event sink is missing.");
        return invokeAgent({
          agent,
          input: request.input,
          threadId: trigger.threadId,
          tools: {},
          engine: { invoke: () => Promise.reject(new Error("Unexpected RELKIT tool.")) },
          contentSink: {
            ...sink,
            emitEvent: async (event: AgentExecutionEvent, signal: AbortSignal) => {
              await emitEvent(event, signal);
              const index = expectedStateIndex(event);
              if (index >= 0) await releases[index]!.promise;
            },
          },
        });
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
    upgradeWebSocket,
  });
  const server = Bun.serve({
    port: 0,
    websocket,
    fetch: (request, bunServer) => app.fetch(request, bunServer),
  });
  servers.push(server);
  const baseUrl = `http://127.0.0.1:${server.port}`;
  const httpWire: string[] = [];
  const websocketWire: string[] = [];
  const http = createClient<typeof clientContract>({
    baseUrl,
    headers: identityHeaders,
    fetch: recordingFetch(httpWire, networkFetch),
  });
  const socket = createWebSocketClient<typeof clientContract>({
    baseUrl,
    websocket: recordingWebSocket(websocketWire),
  });
  const threadId = "order:todo-network";
  const receipt = await http["relkit.agent.run"]({
    agentId: agent.id,
    threadId,
    operationId: createOperationId(),
    kind: "run",
    payload: { message: "Check the order" },
  });
  expect(receipt.duplicate).toBe(false);
  const initial = await http["relkit.agent.load"]({ agentId: agent.id, threadId });
  const after = { ...initial.checkpoint, sequence: "0" };
  const captures = [createCapture(), createCapture(), createCapture()];
  const httpDone = collectObservations(
    await http["relkit.agent.observe"]({ agentId: agent.id, threadId, after }),
    captures[0]!,
  );
  const websocketDone = collectObservations(
    await socket["relkit.agent.observe"]({
      agentId: agent.id,
      threadId,
      after,
      expectedIdentity: { identityScope: "viewer", sessionEpoch: "session" },
    }),
    captures[2]!,
  );
  const sse = await networkFetch(`${baseUrl}/_relkit/v1/agents/${agent.id}/ag-ui`, {
    method: "POST",
    headers: {
      ...identityHeaders,
      "content-type": "application/json",
      "last-event-id": encodeURIComponent(JSON.stringify(after)),
      "x-relkit-agent-observe": "1",
      [AGENT_CAPABILITY_HEADER]: AGENT_CAPABILITY_VALUE,
    },
    body: JSON.stringify({ threadId, runId: receipt.runId }),
  });
  expect(sse.status).toBe(200);
  const sseFrames: string[] = [];
  const sseDone = collectSse(sse, captures[1]!, sseFrames);

  await within(Promise.all(captures.map(({ ready }) => ready.promise)), "observers ready");
  start.resolve();
  for (let index = 0; index < expectedStates.length; index += 1) {
    await within(
      Promise.all(captures.map(({ seen }) => seen[index]!.promise)),
      `todo state ${index + 1}`,
    );
    expect(captures.every(({ terminal }) => !terminal)).toBe(true);
    releases[index]!.resolve();
  }
  await within(Promise.all([httpDone, sseDone, websocketDone]), "terminal frames");

  for (const capture of captures) {
    expect(capture.states).toEqual(expectedStates);
    expect(capture.terminal).toBe(true);
  }
  expect(executions).toBe(1);
  expect(scripted.calls).toHaveLength(4);
  expect(httpWire.join("")).toContain("Find the order");
  expect(websocketWire.join("")).toContain("Find the order");
  expect(sseFrames.join("\n")).toContain(EventType.STATE_SNAPSHOT);
  expect(sseFrames.join("\n")).toContain(EventType.RUN_FINISHED);
}, 15_000);

interface Capture {
  readonly ready: PromiseWithResolvers<void>;
  readonly seen: readonly PromiseWithResolvers<void>[];
  readonly states: unknown[];
  terminal: boolean;
}

function createCapture(): Capture {
  return {
    ready: Promise.withResolvers<void>(),
    seen: expectedStates.map(() => Promise.withResolvers<void>()),
    states: [],
    terminal: false,
  };
}

async function collectObservations(stream: AsyncIterable<AgentObservation>, capture: Capture) {
  for await (const observation of stream) {
    capture.ready.resolve();
    recordObservation(capture, observation);
    if (capture.terminal) return;
  }
}

async function collectSse(response: Response, capture: Capture, rawFrames: string[]) {
  if (response.body === null) throw new Error("SSE response body is missing.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let wireTerminal = false;
  while (!wireTerminal) {
    const next = await reader.read();
    buffer += decoder.decode(next.value, { stream: !next.done }).replace(/\r\n/g, "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      rawFrames.push(block);
      const data = JSON.parse(
        block
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n"),
      ) as unknown;
      capture.ready.resolve();
      const observation = sseObservation(data);
      if (observation !== undefined) recordObservation(capture, observation);
      const type = isRecord(data) ? data.type : undefined;
      if (type === EventType.RUN_FINISHED || type === EventType.RUN_ERROR) {
        capture.terminal = true;
        wireTerminal = true;
      }
      boundary = buffer.indexOf("\n\n");
    }
    if (next.done) break;
  }
  await reader.cancel();
}

function recordObservation(capture: Capture, observation: AgentObservation): void {
  if (observation.kind === "event" && observation.event.kind === "run-finished") {
    capture.terminal = true;
    return;
  }
  const values =
    observation.kind === "event" &&
    observation.event.kind === "execution-event" &&
    observation.event.value.kind === "values" &&
    observation.event.value.scope.length === 0
      ? observation.event.value.value
      : observation.kind !== "event"
        ? observation.snapshot.values
        : undefined;
  if (!isRecord(values) || !Array.isArray(values.todos)) return;
  const index = expectedStates.findIndex(
    (state) => JSON.stringify(state) === JSON.stringify(values.todos),
  );
  if (index < 0 || capture.states.length !== index) return;
  capture.states.push(values.todos);
  capture.seen[index]!.resolve();
}

function expectedStateIndex(event: AgentExecutionEvent): number {
  if (event.kind !== "values" || event.scope.length !== 0 || !isRecord(event.value)) return -1;
  return expectedStates.findIndex(
    (state) => JSON.stringify(state) === JSON.stringify(event.value.todos),
  );
}

function recordingFetch(frames: string[], fetcher: typeof fetch): typeof fetch {
  return async (input, init) => {
    const response = await fetcher(input, init);
    if (response.body === null) return response;
    const decoder = new TextDecoder();
    const body = response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          frames.push(decoder.decode(chunk, { stream: true }));
          controller.enqueue(chunk);
        },
      }),
    );
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}

function recordingWebSocket(frames: string[]): typeof WebSocket {
  return class extends WebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      this.addEventListener("message", (event) => {
        if (typeof event.data === "string") frames.push(event.data);
      });
    }
  };
}

async function within<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    Bun.sleep(5_000).then(() => Promise.reject(new Error(`Timed out waiting for ${label}.`))),
  ]);
}

function sseObservation(value: unknown): AgentObservation | undefined {
  if (!isRecord(value) || !isRecord(value.metadata) || !isRecord(value.metadata.relkit)) {
    return undefined;
  }
  return value.metadata.relkit.observation as AgentObservation | undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

interface AgentRunInput {
  readonly agentId: string;
  readonly threadId: string;
  readonly operationId: string;
  readonly kind: "run";
  readonly payload: { readonly message: string };
}

interface AgentObserveInput {
  readonly agentId: string;
  readonly threadId: string;
  readonly after: JournalCheckpoint;
  readonly expectedIdentity?: {
    readonly identityScope: string;
    readonly sessionEpoch: string;
  };
}

function schema<Value>() {
  return {
    "~standard": {
      version: 1 as const,
      vendor: "relkit-test",
      types: undefined as unknown as { input: Value; output: Value },
      validate: (value: unknown) => ({ value: value as Value }),
    },
  };
}

function agentPlan(): RegistrationPlan {
  return {
    graphHash: "sha256:native-todo-network",
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
        controls: [],
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
