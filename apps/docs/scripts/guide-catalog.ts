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
  group("fundamentals", "Core concepts", "Blocks", [
    "index",
    "application",
    "functions",
    "schemas",
    "errors",
    "context",
    "environment",
  ]),
  serviceGuideGroup,
  httpGuideGroup,
  eventGuideGroup,
  jobsGuideGroup,
  databaseGuideGroup,
  authGuideGroup,
  storageGuideGroup,
  cachingGuideGroup,
  aiGuideGroup,
  group("integrations", "Integrations", "Plug", ["index", "local-docker"]),
  group("operations", "Operations", "Wrench", [
    "index",
    "observability",
    "inspector",
    "testing",
    "deployment",
    "troubleshooting",
    "cli-reference",
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
  relation(
    "fundamentals/index",
    ["app", "functions", "schema"],
    ["templates/default/v1/api/relkit.config.ts"],
  ),
  relation("fundamentals/application", ["app"], ["templates/default/v1/api/relkit.config.ts"]),
  relation(
    "fundamentals/functions",
    ["functions"],
    ["templates/default/v1/api/src/orders/functions/create-order.function.ts"],
  ),
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
    "fundamentals/environment",
    ["config"],
    ["templates/default/v1/api/src/platform/env.ts"],
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
  relation(
    "integrations/index",
    ["integrations/docker", "integrations/redis", "integrations/s3"],
    ["apps/docs/examples/landing/catalog.ts"],
  ),
  relation(
    "integrations/local-docker",
    ["integrations/docker", "integrations/redis", "integrations/s3"],
    [
      "integrations/packages/redis/src/local-recipe/index.ts",
      "integrations/packages/s3/src/local-recipe/index.ts",
    ],
  ),
  relation("operations/index", ["app", "testing"], ["templates/default/v1/api/package.json"]),
  relation(
    "operations/observability",
    ["functions", "routes"],
    ["templates/default/v1/api/src/hello/functions/hello.function.ts"],
  ),
  relation("operations/inspector", ["app", "routes"], ["tests/e2e/inspector-redesign.spec.ts"]),
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
