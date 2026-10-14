/** Defines service/layout/migration navigation and grouped authoring examples while retaining the native public APIs. */
import type { ApiPackage } from "./documentation-catalog.js";

export const serviceGuideGroup = {
  directory: "service",
  title: "Service",
  icon: "Boxes",
  pages: ["index", "domains", "organization", "define", "routes", "first-service", "migration"],
} as const;

export const serviceGuideRelations = [
  {
    path: "service/migration",
    api: ["services", "functions"],
    examples: ["packages/cli/tests/migration/layout.probe.ts"],
  },
  {
    path: "service/index",
    api: ["services", "functions"],
    examples: ["examples/commerce/src/services/orders/service.ts"],
  },
  {
    path: "service/domains",
    api: ["services", "events"],
    examples: ["apps/docs/examples/events/order-confirmation.function.ts"],
  },
  {
    path: "service/organization",
    api: ["services", "functions", "tools", "agents", "jobs", "events", "cache", "buckets"],
    examples: [
      "examples/commerce/src/services/orders/functions/create-order.function.ts",
      "templates/default/v1/agent/src/services/hello/agents/assistant.agent.ts",
    ],
  },
  {
    path: "service/define",
    api: ["services", "functions"],
    examples: ["examples/commerce/src/services/orders/service.ts"],
  },
  {
    path: "service/routes",
    api: ["services", "routes"],
    examples: ["examples/commerce/src/routes/orders/route.ts"],
  },
  {
    path: "service/first-service",
    api: ["services", "functions", "routes", "testing"],
    examples: [
      "templates/default/v1/minimal/src/services/hello/service.ts",
      "templates/default/v1/minimal/tests/unit/hello.function.test.ts",
    ],
  },
] satisfies readonly {
  path: string;
  api: readonly ApiPackage[];
  examples: readonly string[];
}[];
