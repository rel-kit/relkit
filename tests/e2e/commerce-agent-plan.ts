/** Projects maintained grouped source locations into the browser fixture's native registration contract. */
import type { RegistrationPlan } from "../../packages/graph/src/index.ts";
import type { invokeAgent } from "../../integrations/packages/langchain/src/index.ts";
export const AGENT_ID = "orders.order-support";

/**
 * Builds the fixture plan without scanning source or activating application clients.
 * @param agent - Borrowed native agent declaration supplying limits.
 * @returns The stable logical graph with current grouped source metadata.
 */
export function commerceAgentPlan(
  agent: Parameters<typeof invokeAgent>[0]["agent"],
): RegistrationPlan {
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
        source: {
          file: "src/services/announcements/channels/announcements.channel.ts",
          line: 1,
          column: 1,
        },
        params: {},
        events: {},
        profile: "default",
        client: "public",
        replay: { retentionMs: 300_000, maxEvents: 1_000 },
      },
    ],
    agents: [browserAgentNode(agent)],
    middlewares: [],
  };
}

/**
 * Declares one public announcements HTTP operation.
 * @param id - Native route identity.
 * @param method - HTTP method.
 * @param targetFunctionId - Stable function identity.
 * @param operation - Public client operation.
 * @returns Native HTTP trigger metadata.
 */
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

/**
 * Projects the native agent into registration data without activating its model.
 * @param agent - Borrowed declaration providing limits.
 * @returns Stable public-agent metadata with real grouped source provenance.
 */
function browserAgentNode(
  agent: Parameters<typeof commerceAgentPlan>[0],
): NonNullable<RegistrationPlan["agents"]>[number] {
  return {
    kind: "agent",
    id: AGENT_ID,
    source: { file: "src/services/orders/agents/order-support.agent.ts", line: 1, column: 1 },
    input: {},
    output: {},
    instructions: "redacted",
    toolIds: ["orders.lookup-order", "orders.cancel-order", "order_status"],
    limits: { ...agent.limits },
    generatedFunction: {
      functionId: `relkit.agent.${AGENT_ID}.invoke`,
      generated: true,
      generatedBy: "agent",
      agentId: AGENT_ID,
    },
    profile: "default",
    stateProfile: "agents",
    client: "public",
    chat: { input: "message", output: "answer" },
    controls: ["steer", "follow-up", "stop", "approve"],
  };
}
