/**
 * Advertises native execution registrations to the existing verified integration
 * plan. Provider acquisition skips these execution-only capabilities.
 */
import type { RuntimeIntegrationModuleMetadata } from "@relkit/contracts";

export const runtimeIntegration = Object.freeze({
  kind: "runtime-integration",
  integrationId: "langchain",
  registrations: Object.freeze([
    { capability: "agent-execution", adapterId: "langchain", protocolVersion: 1 },
    { capability: "agent-deep", adapterId: "deepagents", protocolVersion: 1 },
  ]),
}) satisfies RuntimeIntegrationModuleMetadata;
