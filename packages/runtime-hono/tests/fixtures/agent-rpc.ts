import { defineAgent } from "@relkit/agents";
import { createLocalAgentStateProvider } from "@relkit/providers-local";
import { z } from "@relkit/schema";
import { upgradeWebSocket, websocket } from "hono/bun";
import type { RegistrationPlan } from "@relkit/graph";
import { createApp, type RuntimeManifest } from "../../src/index.ts";
import { runtimeCohort } from "../test-cohort.ts";
import { awaitFixtureCancellation } from "../fixture-lifetime.js";
const { root }: { root: string } = JSON.parse(process.env.RELKIT_FIXTURE_CONFIG ?? "{}");
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
const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  websocket,
  fetch: (request, bunServer) =>
    new URL(request.url).pathname === "/__fixture/state"
      ? Response.json({ executions })
      : app.fetch(request, bunServer),
});
process.send?.({ port: server.port });
process.once("SIGTERM", () => {
  server.stop(true);
  process.exit(0);
});
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
        generatedFunction: {
          functionId: "relkit.agent.support.echo.invoke",
          generated: true,
          generatedBy: "agent",
          agentId: "support.echo",
        },
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
