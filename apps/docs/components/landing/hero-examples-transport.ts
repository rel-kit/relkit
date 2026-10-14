/** Pure hero metadata for the maintained grouped application examples. */
export const transportExamples = [
  {
    id: "routes",
    title: "Routes",
    guide: "/docs/http/routes",
    panels: [
      {
        label: "Backend",
        file: "src/routes/orders/[orderId]/route.ts",
        source: "routes-be",
      },
      {
        label: "Frontend",
        file: "web/components/order-details.tsx",
        source: "routes-fe",
      },
    ],
  },
  {
    id: "agent",
    title: "Agent",
    guide: "/docs/ai/agents",
    panels: [
      {
        label: "Backend",
        file: "src/services/orders/agents/order-support.agent.ts",
        source: "agent-be",
      },
      {
        label: "Frontend",
        file: "web/components/order-support.tsx",
        source: "agent-fe",
      },
    ],
  },
  {
    id: "graph",
    title: "Graph",
    guide: "/docs/ai/graphs-persistence",
    panels: [
      {
        label: "Backend",
        file: "src/services/orders/agents/order-review.agent.ts",
        source: "graph-be",
      },
      {
        label: "Frontend",
        file: "web/components/order-review.tsx",
        source: "graph-fe",
      },
    ],
  },
  {
    id: "auth",
    title: "Auth",
    guide: "/docs/auth/better-auth",
    panels: [
      {
        label: "Backend",
        file: "src/services/auth/service.ts + auth route",
        source: "auth-be",
      },
      {
        label: "Frontend",
        file: "web/orders/customer-auth.ts",
        source: "auth-fe",
      },
    ],
  },
  {
    id: "realtime",
    title: "Realtime",
    guide: "/docs/realtime/react",
    panels: [
      {
        label: "Backend",
        file: "src/services/chat/channels/messages.channel.ts",
        source: "realtime-be",
      },
      {
        label: "Frontend",
        file: "web/components/order-chat.tsx",
        source: "realtime-fe",
      },
    ],
  },
  {
    id: "stream",
    title: "Streaming",
    guide: "/docs/http/streaming",
    panels: [
      {
        label: "Backend",
        file: "src/services/orders/functions/stream-order-report.function.ts",
        source: "stream-be",
      },
      {
        label: "Frontend",
        file: "web/components/order-report.tsx",
        source: "stream-fe",
      },
    ],
  },
] as const;
