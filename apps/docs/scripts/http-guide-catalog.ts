/** Orders HTTP learning topics and source-backed links for generated navigation and related content. */
import type { ApiPackage } from "./documentation-catalog.js";

export const httpGuideGroup = {
  directory: "docs/modules/http",
  title: "HTTP Routes",
  icon: "Globe",
  pages: [
    "index",
    "first-route",
    "define",
    "routes",
    "requests",
    "responses",
    "middleware",
    "rate-limits",
    "uploads",
    "streaming",
    "raw-handlers",
    "openapi",
    "generated-clients",
  ],
} as const;

export const httpGuideRelations = [
  {
    path: "docs/modules/http/index",
    api: ["routes", "services"],
    examples: ["templates/default/v1/api/src/routes/echo/route.ts"],
  },
  {
    path: "docs/modules/http/define",
    api: ["routes", "services"],
    examples: ["examples/commerce/src/routes/orders/route.ts"],
  },
  {
    path: "docs/modules/http/routes",
    api: ["routes"],
    examples: ["examples/commerce/src/routes/orders/[orderId]/route.ts"],
  },
  {
    path: "docs/modules/http/requests",
    api: ["routes", "schema"],
    examples: ["examples/commerce/src/routes/orders/route.ts"],
  },
  {
    path: "docs/modules/http/uploads",
    api: ["routes", "schema", "buckets"],
    examples: ["examples/commerce/src/routes/uploads/route.ts"],
  },
  {
    path: "docs/modules/http/middleware",
    api: ["routes"],
    examples: ["examples/commerce/src/routes/middleware/order-auth.middleware.ts"],
  },
  {
    path: "docs/modules/http/rate-limits",
    api: ["routes", "cache"],
    examples: ["tests/compiler/rate-limit.test.ts"],
  },
  {
    path: "docs/modules/http/responses",
    api: ["routes", "functions"],
    examples: ["examples/commerce/src/routes/orders/route.ts"],
  },
  {
    path: "docs/modules/http/streaming",
    api: ["routes", "functions", "client"],
    examples: ["packages/runtime-hono/tests/native-stream.test.ts"],
  },
  {
    path: "docs/modules/http/raw-handlers",
    api: ["routes"],
    examples: ["examples/commerce/src/routes/api/auth/[[...auth]]/route.ts"],
  },
  {
    path: "docs/modules/http/openapi",
    api: ["routes"],
    examples: ["examples/commerce/src/routes/orders/[orderId]/route.ts"],
  },
  {
    path: "docs/modules/http/generated-clients",
    api: ["client", "routes"],
    examples: ["examples/commerce/src/platform/generated-client.ts"],
  },
  {
    path: "docs/modules/http/first-route",
    api: ["routes", "functions", "services", "testing"],
    examples: ["templates/default/v1/api/tests/integration/echo.route.test.ts"],
  },
] satisfies readonly {
  path: string;
  api: readonly ApiPackage[];
  examples: readonly string[];
}[];
