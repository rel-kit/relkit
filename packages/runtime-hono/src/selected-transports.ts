/**
 * Selects optional HTTP SDK requirements from application options. These concrete
 * versions mirror optional peer declarations and are checked by packaging tests;
 * ordinary REST/RPC and OpenAPI select no optional SDK requirements.
 */
import type { IntegrationDependencyRequirement } from "@relkit/contracts";
import type { CreateAppOptions } from "./create-app.types.js";
import type { OptionalHttpCapability } from "./optional-transports.types.js";

/** Runtime-owned SDK metadata consumed by the shared selected-dependency checker. */
export const HTTP_TRANSPORT_REQUIREMENTS: readonly IntegrationDependencyRequirement[] = [
  {
    package: "@modelcontextprotocol/server",
    supportedRange: "2.3.0",
    installSection: "dependencies",
    capabilities: ["mcp"],
    phases: ["runtime"],
  },
  {
    package: "@ag-ui/core",
    supportedRange: "0.0.59",
    installSection: "dependencies",
    capabilities: ["ag-ui"],
    phases: ["runtime"],
  },
  {
    package: "@scalar/hono-api-reference",
    supportedRange: "0.12.9",
    installSection: "dependencies",
    capabilities: ["scalar"],
    phases: ["runtime"],
  },
];

/** Selects explicit protocol/UI capabilities without reading request state.
 * @param options - Validated generation configuration.
 * @returns Deterministic independently initialized SDK capability names.
 */
export function selectedHttpCapabilities(
  options: Pick<CreateAppOptions, "mcp" | "agUi" | "apiDocs">,
): OptionalHttpCapability[] {
  const capabilities: OptionalHttpCapability[] = [];
  if (options.mcp?.enabled === true) capabilities.push("mcp");
  if (options.agUi === true) capabilities.push("ag-ui");
  if (options.apiDocs?.ui === "scalar") capabilities.push("scalar");
  return capabilities;
}
