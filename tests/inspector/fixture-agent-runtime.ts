import {
  END,
  MemorySaver,
  START,
  StateSchema,
  interrupt,
} from "../../packages/agents/node_modules/@langchain/langgraph/dist/index.js";
import {
  defineGraph,
  defineGraphNode,
  invokeAgent,
  type AgentContentSink,
} from "../../packages/agents/src/index.ts";
import type { RegistrationPlan } from "../../packages/graph/src/index.ts";
import { createLocalAgentStateProvider } from "../../packages/providers-local/src/index.ts";
import { z } from "../../packages/schema/src/index.ts";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp, type RuntimeManifest } from "../../packages/runtime-hono/src/index.ts";
import { runtimeCohort } from "../../packages/runtime-hono/test-cohort.ts";

const todo = z.object({
  content: z.string(),
  status: z.union([z.literal("pending"), z.literal("in_progress"), z.literal("completed")]),
});
const state = new StateSchema({
  message: z.string(),
  todos: z.array(todo).optional(),
  approved: z.boolean().optional(),
  answer: z.string().optional(),
});
const plan = defineGraphNode({
  id: "plan",
  input: z.object({ message: z.string() }),
  output: z.object({ todos: z.array(todo) }),
  handler: () => ({
    todos: [
      { content: "Look up the order", status: "completed" },
      { content: "Ask for approval", status: "in_progress" },
    ],
  }),
});
const review = defineGraphNode({
  id: "review",
  input: z.object({ message: z.string() }),
  output: z.object({ approved: z.boolean() }),
  resume: z.boolean(),
  handler: () => ({ approved: interrupt({ question: "Approve this order?" }) as boolean }),
});
const complete = defineGraphNode({
  id: "complete",
  input: z.object({ approved: z.boolean() }),
  output: z.object({ answer: z.string(), todos: z.array(todo) }),
  handler: ({ approved }) => ({
    answer: approved ? "The order was approved." : "The order was rejected.",
    todos: [
      { content: "Look up the order", status: "completed" },
      { content: "Ask for approval", status: "completed" },
    ],
  }),
});
const graph = defineGraph({
  id: "support.order",
  state,
  input: z.object({ message: z.string() }),
  output: z.object({ answer: z.string() }),
  nodes: [plan, review, complete],
  edges: (edge) =>
    edge
      .addEdge(START, "plan")
      .addEdge("plan", "review")
      .addEdge("review", "complete")
      .addEdge("complete", END),
  checkpointer: new MemorySaver(),
  limits: { maxSteps: 8, maxToolCalls: 2, timeoutMs: 5_000 },
  stateProfile: "default",
  client: { authorize: () => true, state: ["todos"] },
  controls: ["stop"],
});
const agent = Object.assign(Object.create(graph), {
  chat: { input: "message", output: "answer" },
});
const registration = registrationPlan();
const provider = createLocalAgentStateProvider(
  join(tmpdir(), `relkit-inspector-agent-${process.pid}-${crypto.randomUUID()}`),
  { pollingMs: 50 },
);

export function createAgentApplicationFixture() {
  let session = 0;
  const app = createApp({
    plan: registration,
    manifest: {
      ...runtimeCohort(registration.graphHash),
      functions: {},
      agents: { [graph.id]: agent },
      middleware: {},
      requestTransforms: {},
    } as RuntimeManifest,
    engine: {
      invoke: async (request) => {
        const trigger = request.trigger as {
          readonly threadId: string;
          readonly resume?: boolean;
          readonly contentSink: AgentContentSink;
        };
        if (!trigger.resume) await emitTool(trigger.contentSink, request.signal);
        return invokeAgent({
          agent: graph,
          input: request.input,
          threadId: trigger.threadId,
          resume: trigger.resume,
          contentSink: trigger.contentSink,
          tools: {},
          engine: { invoke: () => Promise.reject(new Error("No tool invocation expected.")) },
        });
      },
    },
    clientIdentity: {
      applicationId: "commerce-api",
      publicFingerprint: "sha256:commerce-inspector-public",
      resolve: () => ({ identityScope: "browser", sessionEpoch: `fixture-${session}` }),
    },
    agentRuntime: {
      applicationId: "commerce-api",
      environment: "test",
      generationId: "commerce-generation-1",
      publicFingerprint: "sha256:commerce-inspector-public",
      provider: () => provider,
    },
    internalEndpoints: { mode: "development" },
  });
  return { app, reset: () => (session += 1) };
}

async function emitTool(sink: AgentContentSink, signal?: AbortSignal): Promise<void> {
  const active = signal ?? new AbortController().signal;
  await sink.emitTool?.(
    {
      toolCallId: "lookup-order-1",
      toolId: "orders.get.tool",
      state: "running",
      value: { orderId: "[REDACTED]" },
    },
    active,
  );
  await sink.emitTool?.(
    {
      toolCallId: "lookup-order-1",
      toolId: "orders.get.tool",
      state: "succeeded",
      value: { status: "confirmed" },
    },
    active,
  );
}

function registrationPlan(): RegistrationPlan {
  return {
    graphHash: "sha256:commerce-inspector-agent-runtime-v1",
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
        id: graph.id,
        source: { file: "src/agents/order-support.agent.ts", line: 3, column: 1 },
        input: {},
        output: {},
        instructions: "",
        toolIds: ["orders.get.tool"],
        limits: graph.limits,
        generatedFunction: { functionId: "relkit.agent.support.order.invoke" },
        profile: "default",
        stateProfile: "default",
        client: "protected",
        chat: { input: "message", output: "answer" },
        controls: ["stop"],
        execution: "graph",
        workflow: graph.workflow,
      },
    ],
  };
}
