import type { ApiPackage } from "./documentation-catalog.js";

export const httpGuideGroup = {
  directory: "http",
  title: "HTTP Routes",
  icon: "Globe",
  pages: [
    "index",
    "define",
    "routes",
    "requests",
    "uploads",
    "middleware",
    "rate-limits",
    "responses",
    "raw-handlers",
    "openapi",
    "generated-clients",
    "first-route",
  ],
} as const;

export const httpGuideRelations = [
  {
    path: "http/index",
    api: ["routes", "services"],
    examples: ["templates/default/v1/api/src/routes/echo/route.ts"],
  },
  {
    path: "http/define",
    api: ["routes", "services"],
    examples: ["examples/commerce/src/routes/orders/route.ts"],
  },
  {
    path: "http/routes",
    api: ["routes"],
    examples: ["examples/commerce/src/routes/orders/[orderId]/route.ts"],
  },
  {
    path: "http/requests",
    api: ["routes", "schema"],
    examples: ["examples/commerce/src/routes/orders/route.ts"],
  },
  {
    path: "http/uploads",
    api: ["routes", "schema", "buckets"],
    examples: ["examples/commerce/src/routes/uploads/route.ts"],
  },
  {
    path: "http/middleware",
    api: ["routes"],
    examples: ["examples/commerce/src/routes/middleware/order-auth.middleware.ts"],
  },
  {
    path: "http/rate-limits",
    api: ["routes", "cache"],
    examples: ["tests/compiler/rate-limit.test.ts"],
  },
  {
    path: "http/responses",
    api: ["routes", "functions"],
    examples: ["examples/commerce/src/routes/orders/route.ts"],
  },
  {
    path: "http/raw-handlers",
    api: ["routes"],
    examples: ["examples/commerce/src/routes/api/auth/[[...auth]]/route.ts"],
  },
  {
    path: "http/openapi",
    api: ["routes"],
    examples: ["examples/commerce/src/routes/orders/[orderId]/route.ts"],
  },
  {
    path: "http/generated-clients",
    api: ["client", "routes"],
    examples: ["examples/commerce/src/platform/generated-client.ts"],
  },
  {
    path: "http/first-route",
    api: ["routes", "functions", "services", "testing"],
    examples: ["templates/default/v1/api/tests/integration/echo.route.test.ts"],
  },
] satisfies readonly {
  path: string;
  api: readonly ApiPackage[];
  examples: readonly string[];
}[];
