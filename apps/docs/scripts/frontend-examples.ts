/** Associates browser-capable declarations with the exact backend examples and authored frontend companions used by module pages. */
export const frontendExamples = [
  {
    source: "packages/routes/src/define-route.ts",
    symbol: "defineRoute",
    partial: "echo",
    backend: ["templates/default/v1/api/src/routes/echo/route.ts"],
  },
  {
    source: "packages/routes/src/define-service-routes.ts",
    symbol: "defineServiceRoutes",
    partial: "orders",
    backend: ["examples/commerce/src/routes/orders/route.ts"],
  },
  {
    source: "packages/functions/src/define-function.ts",
    symbol: "defineFunction",
    partial: "create-order",
    backend: [
      "templates/default/v1/api/src/services/orders/functions/create-order.function.ts",
      "templates/default/v1/api/src/routes/orders/route.ts",
    ],
  },
  {
    source: "packages/services/src/define-service.ts",
    symbol: "defineService",
    partial: "orders",
    backend: [
      "examples/commerce/src/services/orders/service.ts",
      "examples/commerce/src/routes/orders/route.ts",
    ],
  },
  {
    source: "packages/functions/src/stream.ts",
    symbol: "streamOf",
    partial: "stream",
    backend: [
      "examples/commerce/src/services/orders/functions/stream-order-report.function.ts",
      "examples/commerce/src/routes/reports/[reportId]/route.ts",
    ],
  },
  {
    source: "packages/jobs/src/define-job.ts",
    symbol: "defineJob",
    partial: "job",
    backend: ["examples/commerce/src/services/orders/jobs/export-orders.job.ts"],
  },
  {
    source: "packages/agents/src/define-agent.ts",
    symbol: "defineAgent",
    partial: "assistant",
    note: "This SDK-independent factory describes the client contract. The runnable example below uses `defineAgent` from `@relkit/langchain` to supply native execution; see [agent setup](/docs/modules/ai/agents) for the required integration and runtime bindings.",
    backend: ["templates/default/v1/agent/src/services/hello/agents/assistant.agent.ts"],
  },
  {
    source: "integrations/packages/langchain/src/define-agent.ts",
    symbol: "defineAgent",
    partial: "assistant",
    backend: ["templates/default/v1/agent/src/services/hello/agents/assistant.agent.ts"],
  },
  {
    source: "integrations/packages/langchain/src/define-graph.ts",
    symbol: "defineGraph",
    partial: "graph",
    backend: ["examples/commerce/src/services/orders/agents/order-review.agent.ts#review-graph"],
  },
  {
    source: "packages/realtime/src/channel.ts",
    symbol: "defineChannel",
    partial: "channel",
    backend: ["examples/commerce/src/services/announcements/channels/announcements.channel.ts"],
  },
  {
    source: "packages/better-auth/src/index.ts",
    symbol: "defineBetterAuthService",
    partial: "auth",
    backend: [
      "examples/auth-drizzle/src/services/auth/service.ts",
      "examples/auth-drizzle/src/routes/api/auth/[[...auth]]/route.ts",
    ],
  },
  {
    source: "packages/better-auth/src/drizzle.ts",
    symbol: "defineBetterAuthService",
    partial: "auth",
    backend: [
      "examples/auth-drizzle/src/services/auth/service.ts",
      "examples/auth-drizzle/src/routes/api/auth/[[...auth]]/route.ts",
    ],
  },
] as const;
