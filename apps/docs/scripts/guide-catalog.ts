import type { ApiPackage } from "./documentation-catalog.js";

export const guideGroups = [
  group("start", "Start", [
    "create-an-app",
    "first-route",
    "local-development",
    "check",
    "build",
    "production",
  ]),
  group("fundamentals", "Application fundamentals", [
    "application",
    "environment",
    "providers",
    "schemas",
    "errors",
    "context",
    "functions",
    "services",
  ]),
  group("http", "HTTP", [
    "routes",
    "requests",
    "uploads",
    "middleware",
    "rate-limits",
    "responses",
    "openapi",
    "generated-clients",
  ]),
  group("async", "Asynchronous work", ["jobs", "schedules", "events", "listeners"]),
  group("resources-ai", "Resources and AI", ["buckets", "cache", "tools", "approvals", "agents"]),
  group("operations", "Tooling and operations", [
    "cli-reference",
    "inspector",
    "observability",
    "testing",
    "deployment",
    "troubleshooting",
  ]),
] as const;

const relations = [
  relation("index", ["app", "routes", "testing"], ["templates/default/v1/api/README.md"]),
  relation("start/create-an-app", ["app", "config"], ["templates/default/v1/api/README.md"]),
  relation(
    "start/first-route",
    ["functions", "routes"],
    ["templates/default/v1/api/src/routes/hello/route.ts"],
  ),
  relation(
    "start/local-development",
    ["app", "routes"],
    ["templates/default/v1/api/relkit.config.ts"],
  ),
  relation("start/check", ["app"], ["templates/default/v1/api/package.json"]),
  relation("start/build", ["app"], ["templates/default/v1/api/package.json"]),
  relation("start/production", ["app"], ["templates/default/v1/api/package.json"]),
  relation("fundamentals/application", ["app"], ["templates/default/v1/api/relkit.config.ts"]),
  relation("fundamentals/environment", ["config"], ["templates/default/v1/api/src/env.ts"]),
  relation("fundamentals/providers", ["app"], ["examples/commerce/relkit.config.ts"]),
  relation("fundamentals/schemas", ["schema"], ["examples/commerce/src/shared/schemas.ts"]),
  relation(
    "fundamentals/errors",
    ["functions"],
    ["examples/commerce/src/errors/order-not-found.error.ts"],
  ),
  relation(
    "fundamentals/context",
    ["functions"],
    ["examples/commerce/src/functions/orders/create-order.function.ts"],
  ),
  relation(
    "fundamentals/functions",
    ["functions"],
    ["templates/default/v1/api/src/functions/orders/create-order.function.ts"],
  ),
  relation(
    "fundamentals/services",
    ["services"],
    ["examples/commerce/src/services/orders.service.ts"],
  ),
  relation("http/routes", ["routes"], ["examples/commerce/src/routes/orders/[orderId]/route.ts"]),
  relation("http/requests", ["routes", "schema"], ["examples/commerce/src/routes/orders/route.ts"]),
  relation("http/uploads", ["routes", "schema"], ["examples/commerce/src/routes/uploads/route.ts"]),
  relation(
    "http/middleware",
    ["routes"],
    ["examples/commerce/src/middleware/order-auth.middleware.ts"],
  ),
  relation(
    "http/rate-limits",
    ["routes", "cache"],
    ["examples/commerce/src/routes/orders/route.ts"],
  ),
  relation(
    "http/responses",
    ["routes", "functions"],
    ["examples/commerce/src/routes/orders/route.ts"],
  ),
  relation("http/openapi", ["routes"], ["examples/commerce/src/routes/orders/[orderId]/route.ts"]),
  relation(
    "http/generated-clients",
    ["client", "routes"],
    ["examples/commerce/src/generated-client.ts"],
  ),
  relation("async/jobs", ["jobs"], ["examples/commerce/src/jobs/send-receipt.job.ts"]),
  relation("async/schedules", ["jobs"], ["examples/commerce/src/jobs/send-receipt.job.ts"]),
  relation("async/events", ["events"], ["examples/commerce/src/events/order-created.event.ts"]),
  relation("async/listeners", ["events"], ["examples/commerce/src/events/order-receipt.event.ts"]),
  relation("resources-ai/buckets", ["buckets"], ["examples/commerce/src/buckets/assets.bucket.ts"]),
  relation("resources-ai/cache", ["cache"], ["examples/commerce/src/cache/prices.cache.ts"]),
  relation("resources-ai/tools", ["tools"], ["examples/commerce/src/tools/lookup-order.tool.ts"]),
  relation(
    "resources-ai/approvals",
    ["agents", "tools"],
    ["examples/commerce/src/tools/cancel-order.tool.ts"],
  ),
  relation(
    "resources-ai/agents",
    ["agents", "testing"],
    ["examples/commerce/src/agents/order-support.agent.ts"],
  ),
  relation("operations/inspector", ["app", "routes"], ["tests/e2e/inspector-redesign.spec.ts"]),
  relation(
    "operations/observability",
    ["functions", "routes"],
    ["templates/default/v1/api/src/functions/hello.function.ts"],
  ),
  relation(
    "operations/testing",
    ["testing"],
    ["templates/default/v1/api/tests/integration/orders.route.test.ts"],
  ),
  relation(
    "operations/deployment",
    ["app", "jobs", "events", "buckets", "cache"],
    ["examples/commerce/relkit.config.ts"],
  ),
  relation(
    "operations/troubleshooting",
    ["app", "testing"],
    ["templates/default/v1/api/package.json"],
  ),
] as const;

export const guideRelations = relations.map((item, index) => ({
  ...item,
  next: relations[index + 1]?.path ?? "operations/cli-reference",
}));

function group(directory: string, title: string, pages: readonly string[]) {
  return { directory, title, pages };
}

function relation(path: string, api: readonly ApiPackage[], examples: readonly string[]) {
  return { path, api, examples };
}
