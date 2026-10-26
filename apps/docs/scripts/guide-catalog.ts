/** Pure guide metadata joins maintained source examples with the documented learning sequence. */
import { group, relation, nextGuide } from "./guide-catalog-helpers.js";
export { startJourney } from "../lib/start-journey.js";
import { eventGuideGroup, eventGuideRelations } from "./event-guide-catalog.js";
import {
  storageGuideGroup,
  storageGuideRelations,
  uploadGuideRelation,
} from "./storage-guide-catalog.js";
import { cachingGuideGroup, cachingGuideRelations } from "./caching-guide-catalog.js";
import { aiGuideGroup, aiGuideRelations } from "./ai-guide-catalog.js";
import { serviceGuideGroup, serviceGuideRelations } from "./service-guide-catalog.js";
import { httpGuideGroup, httpGuideRelations } from "./http-guide-catalog.js";
import { jobsGuideGroup, jobsGuideRelations } from "./jobs-guide-catalog.js";
import { databaseGuideGroup, databaseGuideRelations } from "./database-guide-catalog.js";
import { authGuideGroup, authGuideRelations } from "./auth-guide-catalog.js";
import {
  clientGuideGroup,
  clientGuideRelations,
  frontendGuideGroup,
  frontendGuideRelation,
} from "./client-guide-catalog.js";
import { realtimeGuideGroup, realtimeGuideRelations } from "./realtime-guide-catalog.js";
import { operationsGuideRelations } from "./operations-guide-catalog.js";
import { cliGuideGroup, cliGuideRelations } from "./cli-guide-catalog.js";
import { deploymentGuideGroup, deploymentGuideRelations } from "./deployment-guide-catalog.js";
export const guideGroups = [
  group("docs/learn", "Learn", "Rocket", [
    "index",
    "create-an-app",
    "first-route",
    "save-orders",
    "protect-orders",
    "test-orders",
    "local-development",
    "build-and-run",
    "concepts",
  ]),
  group("docs/learn/concepts", "Core concepts", "Blocks", [
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
  clientGuideGroup,
  realtimeGuideGroup,
  group("docs/modules/integrations", "Integrations", "Plug", [
    "index",
    "local-docker",
    "provider-authoring",
    "local-providers",
  ]),
  deploymentGuideGroup,
  group("docs/modules/operations", "Operations", "Wrench", [
    "index",
    "observability",
    "inspector",
    "realtime-agents-streaming",
    "testing",
    "troubleshooting",
  ]),
  cliGuideGroup,
  group("docs/modules/jobs/providers", "Job providers", "Plug", [
    "index",
    "comparison",
    "inngest",
    "trigger",
    "effect-mq",
  ]),
  group("guides/cli", "CLI", "Terminal", ["create-and-build-an-api"]),
  frontendGuideGroup,
  group("guides/storage", "Storage", "HardDrive", ["upload-product-images"]),
  group("guides/caching", "Caching", "Zap", ["cache-product-prices"]),
  group("guides/events", "Events", "Radio", ["react-to-order-events"]),
  group("guides/database", "Database", "Database", ["register-users-in-a-transaction"]),
  group("guides/auth", "Authentication", "ShieldCheck", ["email-password-sign-in"]),
  group("guides/ai", "AI", "Bot", ["build-an-offline-agent"]),
] as const;
const relations = [
  relation("docs/index", ["app", "routes", "testing"], ["templates/default/v1/api/README.md"]),
  relation("docs/learn/index", ["app"], ["templates/default/v1/minimal/README.md"]),
  relation("docs/modules/index", ["app"], []),
  relation("guides/index", ["app"], []),
  uploadGuideRelation,
  frontendGuideRelation,
  relation(
    "guides/caching/cache-product-prices",
    ["cache", "functions", "testing", "integrations/redis", "integrations/docker"],
    ["examples/commerce/tests/fixtures/get-price.function.ts"],
  ),
  relation(
    "guides/ai/build-an-offline-agent",
    ["agents", "tools", "testing"],
    ["templates/default/v1/agent/src/services/hello/agents/assistant.agent.ts"],
  ),
  ...["comparison", "inngest", "trigger", "effect-mq"].map((page) =>
    relation(
      `docs/modules/jobs/providers/${page}`,
      ["jobs"],
      ["tests/jobs/compatibility/evidence/capability-matrix.json"],
    ),
  ),
  relation("docs/learn/create-an-app", ["app", "config"], ["templates/default/v1/api/README.md"]),
  relation(
    "docs/learn/first-route",
    ["functions", "routes"],
    ["templates/default/v1/api/src/routes/orders/route.ts"],
  ),
  relation(
    "docs/learn/save-orders",
    ["drizzle", "functions"],
    ["examples/data-model/src/services/database/service.ts"],
  ),
  relation(
    "docs/learn/protect-orders",
    ["better-auth", "drizzle"],
    ["examples/auth-drizzle/src/services/auth/service.ts"],
  ),
  relation(
    "docs/learn/test-orders",
    ["testing", "routes"],
    ["templates/default/v1/api/tests/integration/orders.route.test.ts"],
  ),
  relation(
    "docs/learn/local-development",
    ["app", "routes"],
    ["templates/default/v1/api/relkit.config.ts"],
  ),
  relation(
    "docs/learn/build-and-run",
    ["app", "routes"],
    ["templates/default/v1/api/package.json"],
  ),
  relation(
    "docs/learn/concepts/index",
    ["app", "functions", "schema"],
    ["templates/default/v1/api/relkit.config.ts"],
  ),
  relation(
    "docs/learn/concepts/application",
    ["app"],
    ["templates/default/v1/api/relkit.config.ts"],
  ),
  relation(
    "docs/learn/concepts/functions",
    ["functions"],
    ["templates/default/v1/api/src/services/orders/functions/create-order.function.ts"],
  ),
  relation(
    "docs/learn/concepts/schemas",
    ["schema"],
    ["examples/commerce/src/platform/schemas.ts"],
  ),
  relation(
    "docs/learn/concepts/errors",
    ["functions"],
    ["examples/commerce/src/services/orders/errors/order-not-found.error.ts"],
  ),
  relation(
    "docs/learn/concepts/context",
    ["functions"],
    ["examples/commerce/src/services/orders/functions/create-order.function.ts"],
  ),
  relation(
    "docs/learn/concepts/environment",
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
  ...clientGuideRelations,
  ...realtimeGuideRelations,
  ...operationsGuideRelations,
  ...deploymentGuideRelations,
  ...cliGuideRelations,
] as const;
export const guideRelations = relations.map((item) => ({ ...item, next: nextGuide(item.path) }));
