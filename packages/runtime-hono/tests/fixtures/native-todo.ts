import {
  defineAgent,
  invokeAgent,
  type AgentContentSink,
  type AgentExecutionEvent,
} from "@relkit/agents";
import { createLocalAgentStateProvider } from "@relkit/providers-local";
import { z } from "@relkit/schema";
import { todoListMiddleware } from "langchain";
import { createTodoTestModel } from "../deepagent-test-model.ts";
import { createApp } from "../../src/index.ts";
import { upgradeWebSocket, websocket } from "hono/bun";
import { expectedStates, expectedStateIndex, agentPlan, manifest } from "./todo-setup.ts";
const { root }: { root: string } = JSON.parse(process.env.RELKIT_FIXTURE_CONFIG ?? "{}");
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
  hostname: "127.0.0.1",
  websocket,
  fetch: (request, bunServer) => {
    const path = new URL(request.url).pathname;
    if (path === "/__fixture/start") {
      start.resolve();
      return new Response(null, { status: 204 });
    }
    if (path.startsWith("/__fixture/release/")) {
      releases[Number(path.split("/").at(-1))]?.resolve();
      return new Response(null, { status: 204 });
    }
    if (path === "/__fixture/state")
      return Response.json({ executions, calls: scripted.calls.length });
    return app.fetch(request, bunServer);
  },
});
process.send?.({ port: server.port });
process.once("SIGTERM", () => {
  start.resolve();
  for (const release of releases) release.resolve();
  server.stop(true);
  process.exit(0);
});
