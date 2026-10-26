/** Links operational module pages to their public contracts and maintained examples. */
import { relation } from "./guide-catalog-helpers.js";

export const operationsGuideRelations = [
  relation(
    "docs/modules/integrations/index",
    [
      "integrations/catalog",
      "integrations/docker",
      "integrations/redis",
      "integrations/s3",
      "integrations/cloudflare",
      "integrations/local",
    ],
    ["apps/docs/examples/landing/catalog.ts"],
  ),
  relation(
    "docs/modules/integrations/local-docker",
    ["integrations/docker", "integrations/redis", "integrations/s3"],
    [
      "integrations/packages/redis/src/local-recipe/index.ts",
      "integrations/packages/s3/src/local-recipe/index.ts",
    ],
  ),
  relation(
    "docs/modules/operations/index",
    ["app", "testing"],
    ["templates/default/v1/api/package.json"],
  ),
  relation(
    "docs/modules/operations/observability",
    ["functions", "routes", "integrations/otlp", "integrations/sentry"],
    ["templates/default/v1/api/src/services/hello/functions/hello.function.ts"],
  ),
  relation(
    "docs/modules/operations/inspector",
    ["app", "routes", "inspector", "observability-local"],
    ["tests/e2e/inspector-redesign.spec.ts"],
  ),
  relation(
    "docs/modules/operations/realtime-agents-streaming",
    ["realtime", "agents", "client"],
    ["packages/runtime-hono/tests/realtime-rpc.test.ts"],
  ),
  relation(
    "docs/modules/operations/testing",
    ["testing"],
    ["templates/default/v1/api/tests/integration/orders.route.test.ts"],
  ),
  relation(
    "docs/modules/operations/troubleshooting",
    ["app", "testing"],
    ["templates/default/v1/api/package.json"],
  ),
  relation(
    "docs/modules/integrations/provider-authoring",
    ["provider"],
    ["apps/docs/examples/public-api/provider.ts"],
  ),
  relation(
    "docs/modules/integrations/local-providers",
    ["providers-local", "integrations/local"],
    ["apps/docs/examples/public-api/local.ts"],
  ),
  relation(
    "docs/modules/service/context-values",
    ["app", "config"],
    ["apps/docs/examples/public-api/context.ts"],
  ),
] as const;
