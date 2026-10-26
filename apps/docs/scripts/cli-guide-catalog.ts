/** Connects CLI workflows, command explanations, and programmatic tooling to maintained sources. */
import { group, relation } from "./guide-catalog-helpers.js";

export const cliGuideGroup = group("docs/modules/cli", "CLI", "Terminal", [
  "index",
  "create-an-app",
  "add-artifacts",
  "automation",
]);

export const cliGuideRelations = [
  relation("docs/modules/cli/index", ["app"], []),
  relation("docs/modules/cli/create-an-app", ["app"], ["templates/default/v1/minimal/README.md"]),
  relation(
    "docs/modules/cli/add-artifacts",
    ["services", "functions", "routes"],
    ["templates/default/v1/api/src/services/orders/service.ts"],
  ),
  relation(
    "docs/modules/cli/automation",
    ["cli-api", "create-relkit", "relkit"],
    ["apps/docs/examples/public-api/tooling.ts"],
  ),
  relation(
    "guides/cli/create-and-build-an-api",
    ["routes"],
    ["templates/default/v1/minimal/package.json"],
  ),
] as const;
