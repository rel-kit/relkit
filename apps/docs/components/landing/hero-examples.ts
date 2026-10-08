export type { HeroCodePanel, HeroExample } from "./hero-examples.types";

// Hero excerpts omit framework imports and abbreviate app imports to filenames.
export const heroExampleDefinitions = [
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
        file: "src/orders/agents/order-support.agent.ts",
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
        file: "src/orders/agents/order-review.agent.ts",
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
        file: "src/auth/service.ts + auth route",
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
        file: "src/chat/channels/messages.channel.ts",
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
        file: "src/orders/functions/stream-order-report.function.ts",
        source: "stream-be",
      },
      {
        label: "Frontend",
        file: "web/components/order-report.tsx",
        source: "stream-fe",
      },
    ],
  },
  {
    id: "function",
    title: "Function",
    guide: "/docs/fundamentals/functions",
    panels: [
      {
        label: "Backend",
        file: "src/orders/functions/create-order.function.ts",
        source: "function-be",
      },
      {
        label: "Usage",
        file: "src/orders/functions/checkout.function.ts",
        source: "function-usage",
      },
    ],
  },
  {
    id: "service",
    title: "Service",
    guide: "/docs/service/define",
    panels: [
      {
        label: "Backend",
        file: "src/orders/service.ts",
        source: "service-be",
      },
      {
        label: "Routes",
        file: "src/routes/orders/route.ts",
        source: "service-routes",
        guide: "/docs/service/routes",
      },
    ],
  },
  {
    id: "event",
    title: "Event",
    guide: "/docs/events/define",
    panels: [
      {
        label: "Backend",
        file: "src/orders/events/order-created.event.ts + subscriber",
        source: "event-be",
      },
      {
        label: "Usage",
        file: "src/orders/functions/create-order.function.ts",
        source: "event-usage",
      },
    ],
  },
  {
    id: "cache",
    title: "Cache",
    guide: "/docs/caching/first-cache",
    panels: [
      {
        label: "Backend",
        file: "src/orders/cache/prices.cache.ts",
        source: "cache-be",
      },
      {
        label: "Usage",
        file: "src/orders/functions/get-price.function.ts",
        source: "cache-usage",
      },
    ],
  },
  {
    id: "buckets",
    title: "Bucket",
    guide: "/docs/storage/define",
    panels: [
      {
        label: "Backend",
        file: "src/orders/buckets/receipts.bucket.ts",
        source: "buckets-be",
      },
      {
        label: "Usage",
        file: "src/orders/functions/upload-receipt.function.ts",
        source: "buckets-usage",
      },
    ],
  },
  {
    id: "database",
    title: "Database",
    guide: "/docs/database/define",
    panels: [
      {
        label: "Backend",
        file: "src/database/service.ts",
        source: "database-be",
      },
      {
        label: "Usage",
        file: "src/orders/functions/list-orders.function.ts",
        source: "database-usage",
      },
    ],
  },
  {
    id: "background-job",
    title: "Jobs",
    guide: "/docs/jobs/clients",
    panels: [
      {
        label: "Backend",
        file: "src/orders/jobs/export-orders.job.ts",
        source: "background-job-be",
      },
      {
        label: "Frontend",
        file: "web/components/export-orders.tsx",
        source: "background-job-fe",
      },
    ],
  },
  {
    id: "observability",
    title: "Observability",
    guide: "/docs/operations/observability",
    panels: [
      {
        label: "Backend",
        file: "src/orders/functions/create-order.function.ts",
        source: "observability-be",
      },
    ],
  },
] as const;
