import type { ApiPackage } from "./documentation-catalog.js";
import { eventGuideGroup, eventGuideRelations } from "./event-guide-catalog.js";
import { storageGuideGroup, storageGuideRelations } from "./storage-guide-catalog.js";
import { cachingGuideGroup, cachingGuideRelations } from "./caching-guide-catalog.js";
import { aiGuideGroup, aiGuideRelations } from "./ai-guide-catalog.js";
import { serviceGuideGroup, serviceGuideRelations } from "./service-guide-catalog.js";
import { httpGuideGroup, httpGuideRelations } from "./http-guide-catalog.js";
import { jobsGuideGroup, jobsGuideRelations } from "./jobs-guide-catalog.js";
import { databaseGuideGroup, databaseGuideRelations } from "./database-guide-catalog.js";
import { authGuideGroup, authGuideRelations } from "./auth-guide-catalog.js";

export const guideGroups = [
  group("start", "Start", "Rocket", ["create-an-app", "first-route", "local-development"]),
  serviceGuideGroup,
  httpGuideGroup,
  eventGuideGroup,
  jobsGuideGroup,
  databaseGuideGroup,
  authGuideGroup,
  storageGuideGroup,
  cachingGuideGroup,
  aiGuideGroup,
  group("fundamentals", "Application fundamentals", "Blocks", [
    "application",
    "environment",
    "providers",
    "schemas",
    "errors",
    "context",
    "functions",
    "services",
    "domain-first-migration",
  ]),
  group("async", "Asynchronous work", "Timer", ["jobs", "schedules", "events", "listeners"]),
  group("operations", "Tooling and operations", "Wrench", [
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
  ...serviceGuideRelations,
  ...httpGuideRelations,
  ...eventGuideRelations,
  ...jobsGuideRelations,
  ...databaseGuideRelations,
  ...authGuideRelations,
  ...storageGuideRelations,
  ...cachingGuideRelations,
  ...aiGuideRelations,
  relation("fundamentals/application", ["app"], ["templates/default/v1/api/relkit.config.ts"]),
  relation(
    "fundamentals/environment",
    ["config"],
    ["templates/default/v1/api/src/platform/env.ts"],
  ),
  relation("fundamentals/providers", ["app"], ["examples/commerce/relkit.config.ts"]),
  relation("fundamentals/schemas", ["schema"], ["examples/commerce/src/platform/schemas.ts"]),
  relation(
    "fundamentals/errors",
    ["functions"],
    ["examples/commerce/src/orders/errors/order-not-found.error.ts"],
  ),
  relation(
    "fundamentals/context",
    ["functions"],
    ["examples/commerce/src/orders/functions/create-order.function.ts"],
  ),
  relation(
    "fundamentals/functions",
    ["functions"],
    ["templates/default/v1/api/src/orders/functions/create-order.function.ts"],
  ),
  relation("fundamentals/services", ["services"], ["examples/commerce/src/orders/service.ts"]),
  relation(
    "fundamentals/domain-first-migration",
    ["services", "routes"],
    ["examples/commerce/src/orders/service.ts"],
  ),
  relation("async/jobs", ["jobs"], ["examples/commerce/src/receipts/jobs/send-receipt.job.ts"]),
  relation(
    "async/schedules",
    ["jobs"],
    ["examples/commerce/src/receipts/jobs/send-receipt.job.ts"],
  ),
  relation(
    "async/events",
    ["events"],
    ["templates/default/v1/api/src/orders/events/order-created.event.ts"],
  ),
  relation(
    "async/listeners",
    ["events"],
    ["templates/default/v1/api/src/orders/functions/order-confirmation.function.ts"],
  ),
  relation("operations/inspector", ["app", "routes"], ["tests/e2e/inspector-redesign.spec.ts"]),
  relation(
    "operations/observability",
    ["functions", "routes"],
    ["templates/default/v1/api/src/hello/functions/hello.function.ts"],
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

function group(directory: string, title: string, icon: string, pages: readonly string[]) {
  return { directory, title, icon, pages };
}

function relation(path: string, api: readonly ApiPackage[], examples: readonly string[]) {
  return { path, api, examples };
}
