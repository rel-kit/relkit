/** Pure hero metadata for the maintained grouped application examples. */
export const capabilityExamples = [
  {
    id: "function",
    title: "Function",
    guide: "/docs/learn/concepts/functions",
    panels: [
      {
        label: "Backend",
        file: "src/services/orders/functions/create-order.function.ts",
        source: "function-be",
      },
      {
        label: "Usage",
        file: "src/services/orders/functions/checkout.function.ts",
        source: "function-usage",
      },
    ],
  },
  {
    id: "service",
    title: "Service",
    guide: "/docs/modules/service/define",
    panels: [
      {
        label: "Backend",
        file: "src/services/orders/service.ts",
        source: "service-be",
      },
      {
        label: "Routes",
        file: "src/routes/orders/route.ts",
        source: "service-routes",
        guide: "/docs/modules/service/routes",
      },
    ],
  },
  {
    id: "event",
    title: "Event",
    guide: "/docs/modules/events/define",
    panels: [
      {
        label: "Backend",
        file: "src/services/orders/events/order-created.event.ts + subscriber",
        source: "event-be",
      },
      {
        label: "Usage",
        file: "src/services/orders/functions/create-order.function.ts",
        source: "event-usage",
      },
    ],
  },
  {
    id: "cache",
    title: "Cache",
    guide: "/guides/caching/cache-product-prices",
    panels: [
      {
        label: "Backend",
        file: "src/services/orders/cache/prices.cache.ts",
        source: "cache-be",
      },
      {
        label: "Usage",
        file: "src/services/orders/functions/get-price.function.ts",
        source: "cache-usage",
      },
    ],
  },
  {
    id: "buckets",
    title: "Bucket",
    guide: "/docs/modules/storage/define",
    panels: [
      {
        label: "Backend",
        file: "src/services/orders/buckets/receipts.bucket.ts",
        source: "buckets-be",
      },
      {
        label: "Usage",
        file: "src/services/orders/functions/upload-receipt.function.ts",
        source: "buckets-usage",
      },
    ],
  },
  {
    id: "database",
    title: "Database",
    guide: "/docs/modules/database/define",
    panels: [
      {
        label: "Backend",
        file: "src/services/database/service.ts",
        source: "database-be",
      },
      {
        label: "Usage",
        file: "src/services/orders/functions/list-orders.function.ts",
        source: "database-usage",
      },
    ],
  },
  {
    id: "background-job",
    title: "Jobs",
    guide: "/docs/modules/jobs/clients",
    panels: [
      {
        label: "Backend",
        file: "src/services/orders/jobs/export-orders.job.ts",
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
    guide: "/docs/modules/operations/observability",
    panels: [
      {
        label: "Backend",
        file: "src/services/orders/functions/create-order.function.ts",
        source: "observability-be",
      },
    ],
  },
] as const;
