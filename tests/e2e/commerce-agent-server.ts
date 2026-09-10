import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import orderSupport from "../../examples/commerce/src/orders/agents/order-support.agent.ts";
import announcements from "../../examples/commerce/src/announcements/channels/announcements.channel.ts";
import getAnnouncements from "../../examples/commerce/src/announcements/functions/get-announcements.function.ts";
import postAnnouncement from "../../examples/commerce/src/announcements/functions/post-announcement.function.ts";
import cancelOrder from "../../examples/commerce/src/orders/tools/cancel-order.tool.ts";
import lookupOrder from "../../examples/commerce/src/orders/tools/lookup-order.tool.ts";
import { invokeAgent, type AgentContentSink } from "../../packages/agents/src/index.ts";
import type { RegistrationPlan } from "../../packages/graph/src/index.ts";
import {
  createLocalAgentStateProvider,
  createLocalRealtimeProvider,
} from "../../packages/providers-local/src/index.ts";
import { createProviderRealtimeDispatcher } from "../../packages/realtime/src/index.ts";
import { createApp, type RuntimeManifest } from "../../packages/runtime-hono/src/index.ts";
import { runtimeCohort } from "../../packages/runtime-hono/test-cohort.ts";

const AGENT_ID = "orders.order-support";
const stateRoot = mkdtempSync(join(tmpdir(), "relkit-commerce-browser-"));
const provider = createLocalAgentStateProvider(stateRoot, { pollingMs: 50 });
const realtimeProvider = createLocalRealtimeProvider(stateRoot, { pollingMs: 50 });
const announcementMessages: string[] = [];
const agent = Object.create(orderSupport) as typeof orderSupport;
Object.defineProperty(agent, "id", { enumerable: true, value: AGENT_ID });
Object.freeze(agent);

const clientManifest = (await Bun.file(
  new URL("../../examples/commerce/.relkit/generated/client-manifest.json", import.meta.url),
).json()) as { readonly publicFingerprint: string };
const plan = registrationPlan();
const dispatcher = createProviderRealtimeDispatcher({
  applicationId: "commerce-api",
  environment: "test",
  generationId: "commerce-browser-generation",
  publicFingerprint: clientManifest.publicFingerprint,
  provider: () => realtimeProvider,
});
const app = createApp({
  plan,
  manifest: {
    ...runtimeCohort(plan.graphHash),
    functions: {
      "announcements.get-announcements": getAnnouncements,
      "announcements.post-announcement": postAnnouncement,
    },
    agents: { [AGENT_ID]: agent },
    channels: { "announcements.feed": announcements },
    middleware: {},
    requestTransforms: {},
  } satisfies RuntimeManifest,
  engine: {
    invoke: async (request) => {
      if (request.functionId === "announcements.get-announcements") {
        return { messages: announcementMessages };
      }
      if (request.functionId === "announcements.post-announcement") {
        const { message } = request.input as { readonly message: string };
        announcementMessages.push(message);
        await dispatcher.trigger({
          channel: announcements,
          params: {},
          event: "posted",
          payload: { message, postedAt: new Date().toISOString() },
        });
        return { accepted: true };
      }
      const trigger = request.trigger as {
        readonly threadId: string;
        readonly contentSink: AgentContentSink;
      };
      return invokeAgent({
        agent,
        input: request.input,
        threadId: trigger.threadId,
        tools: [lookupOrder, cancelOrder],
        engine: { invoke: () => Promise.reject(new Error("Unexpected RELKIT tool invocation.")) },
        contentSink: trigger.contentSink,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      });
    },
  },
  clientIdentity: {
    applicationId: "commerce-api",
    publicFingerprint: clientManifest.publicFingerprint,
    resolve: () => ({
      identityScope: "commerce-browser",
      sessionEpoch: "commerce-browser-session",
      setCookies: ["relkit_csrf=commerce-browser-csrf; Path=/; SameSite=Lax"],
    }),
  },
  agentRuntime: {
    applicationId: "commerce-api",
    environment: "test",
    generationId: "commerce-browser-generation",
    publicFingerprint: clientManifest.publicFingerprint,
    provider: () => provider,
  },
  realtime: {
    applicationId: "commerce-api",
    environment: "test",
    provider: () => realtimeProvider,
  },
  transportSecurity: {
    allowedOrigins: ["http://127.0.0.1:3010"],
    validateCsrf: (_request, token) => token === "commerce-browser-csrf",
  },
});

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.RELKIT_COMMERCE_FIXTURE_PORT ?? 4010),
  fetch: app.fetch,
});

function registrationPlan(): RegistrationPlan {
  return {
    graphHash: "sha256:commerce-browser-agent",
    functions: [],
    httpTriggers: [
      route("route.get.announcements", "GET", "announcements.get-announcements", "query"),
      route("route.post.announcements", "POST", "announcements.post-announcement", "mutation"),
    ],
    queues: [],
    schedules: [],
    eventTriggers: [],
    buckets: [],
    caches: [],
    tools: [],
    channels: [
      {
        kind: "channel",
        id: "announcements.feed",
        source: { file: "src/announcements/channels/announcements.channel.ts", line: 1, column: 1 },
        params: {},
        events: {},
        profile: "default",
        client: "public",
        replay: { retentionMs: 300_000, maxEvents: 1_000 },
      },
    ],
    agents: [
      {
        kind: "agent",
        id: AGENT_ID,
        source: { file: "src/orders/agents/order-support.agent.ts", line: 1, column: 1 },
        input: {},
        output: {},
        instructions: "redacted",
        toolIds: ["orders.lookup-order", "orders.cancel-order", "order_status"],
        limits: agent.limits,
        generatedFunction: { functionId: `relkit.agent.${AGENT_ID}.invoke` },
        profile: "default",
        stateProfile: "agents",
        client: "public",
        chat: { input: "message", output: "answer" },
        controls: ["steer", "follow-up", "stop", "approve"],
      },
    ],
    middlewares: [],
  };
}

function route(
  id: string,
  method: "GET" | "POST",
  targetFunctionId: string,
  operation: "query" | "mutation",
): RegistrationPlan["httpTriggers"][number] {
  return {
    kind: "trigger",
    id,
    source: { file: "src/routes/announcements/route.ts", line: 1, column: 1 },
    triggerType: "http",
    targetFunctionId,
    config: {
      method,
      path: "/announcements",
      request: { kind: "input" },
      responses: [],
      middleware: [],
      transforms: [],
      client: { operation },
    },
  };
}

function close(): void {
  server.stop(true);
  rmSync(stateRoot, { recursive: true, force: true });
  process.exit(0);
}

process.once("SIGINT", close);
process.once("SIGTERM", close);
console.log(`Commerce agent fixture listening on ${server.url.origin}`);
