/** Constructs the echo agent, observable engine and two generation HTTP clients plus the native WebSocket server. The shared lifetime fixture owns provider/run/server cleanup. */
import { defineAgent } from "@relkit/langchain";
import { createLocalAgentStateProvider } from "@relkit/providers-local";
import { createOperationId } from "@relkit/realtime";
import { z } from "@relkit/schema";
import { AGENT_CAPABILITY_HEADER } from "@relkit/contracts";
import { createApp } from "../src/index.ts";
import {
  trackFixtureRun,
  trackFixtureProvider,
  awaitFixtureCancellation,
} from "./fixture-lifetime.js";
import { createFixtureClient, createFixtureWebSocketClient, appFetch } from "./fixture-client.js";
import { startBunFixture } from "./bun-fixture.ts";
import {
  agentPlan,
  manifest,
  agentRpcRoot,
  retainAgentRpcServer,
} from "./agent-rpc-support.fixture.js";

/** Builds the original echo authorizer and records each requested operation.
 * @param authorizedOperations - Shared ordered record of authorization requests.
 * @returns The echo descriptor whose authorizer appends to the supplied operation record.
 */
function echoAgent(authorizedOperations: string[]) {
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
  return agent;
}

/** Records engine invocations, prior messages and thread identities without replaying held runs.
 * @returns The held-run engine, ordered history observations and live invocation count.
 */
function echoEngine() {
  let executions = 0;
  const histories: unknown[] = [];
  const threadIds: unknown[] = [];
  const engine = {
    invoke: async (request: {
      readonly input: unknown;
      readonly signal?: AbortSignal;
      readonly trigger?: unknown;
    }) => {
      executions += 1;
      histories.push((request.trigger as { readonly messages?: unknown } | undefined)?.messages);
      threadIds.push((request.trigger as { readonly threadId?: unknown } | undefined)?.threadId);
      const message = (request.input as { readonly message: string }).message;
      if (message === "hold") {
        await awaitFixtureCancellation(request.signal);
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
      return { answer: "hello" };
    },
  };
  return {
    engine,
    histories,
    threadIds,
    get executions() {
      return executions;
    },
  };
}

/** Constructs one generation against the same native provider and engine.
 * @param agent - Native agent descriptor installed in the scenario manifest.
 * @param provider - Native state provider shared by the scenario generations.
 * @param engine - Original invocation implementation with live execution observations.
 * @param generationId - Owner identity recorded for runs started by this application.
 * @returns An application using the original identity and the selected generation owner.
 */
function echoApp(
  agent: ReturnType<typeof echoAgent>,
  provider: ReturnType<typeof createLocalAgentStateProvider>,
  engine: ReturnType<typeof echoEngine>["engine"],
  generationId: string,
) {
  const plan = agentPlan();
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
      track: trackFixtureRun,
      applicationId: "fixture",
      environment: "test",
      generationId,
      publicFingerprint: "sha256:public",
      provider: () => provider,
    },
  });
  return app;
}

/** Builds the original compatible HTTP client for an in-process generation.
 * @param app - In-process Hono application addressed through the native fetch adapter.
 * @returns The public HTTP client with the original viewer/session headers.
 */
function echoClient(app: ReturnType<typeof createApp>) {
  const client = createFixtureClient({
    baseUrl: "http://relkit.test",
    headers: { "x-relkit-identity-scope": "viewer", "x-relkit-session-epoch": "session" },
    fetch: appFetch(app),
  });
  return client;
}

/** Builds the deliberately unsupported capability client against the same application.
 * @param app - In-process Hono application addressed through the native fetch adapter.
 * @returns A public client advertising the deliberately unsupported cursor capability.
 */
function incompatibleEchoClient(app: ReturnType<typeof createApp>) {
  const incompatibleClient = createFixtureClient({
    baseUrl: "http://relkit.test",
    headers: {
      "x-relkit-identity-scope": "viewer",
      "x-relkit-session-epoch": "session",
      [AGENT_CAPABILITY_HEADER]: "cursor-replay.v1",
    },
    fetch: appFetch(app),
  });
  return incompatibleClient;
}

/** Acquires the native echo transport fixture in its original setup order.
 * @returns Both generation clients, native socket client and live engine observations.
 */
export async function createEchoRpcFixture() {
  const root = await agentRpcRoot("relkit-agent-rpc-");
  const provider = trackFixtureProvider(createLocalAgentStateProvider(root, { pollingMs: 50 }));
  const authorizedOperations: string[] = [];
  const agent = echoAgent(authorizedOperations);
  const native = echoEngine();
  const app = echoApp(agent, provider, native.engine, "generation-a");
  const client = echoClient(app);
  const incompatibleClient = incompatibleEchoClient(app);
  const server = await startBunFixture("agent-rpc", { root });
  retainAgentRpcServer(server);
  const socketClient = createFixtureWebSocketClient({
    baseUrl: `http://127.0.0.1:${server.port}`,
  });
  const appB = echoApp(agent, provider, native.engine, "generation-b");
  const clientB = echoClient(appB);
  const operationId = createOperationId();
  const threadId = "conversation:echo";
  return {
    agent,
    client,
    incompatibleClient,
    socketClient,
    server,
    clientB,
    operationId,
    threadId,
    authorizedOperations,
    histories: native.histories,
    threadIds: native.threadIds,
    get executions() {
      return native.executions;
    },
  };
}
