/**
 * Selects generated agent imports and lifecycle operations from the fully
 * validated graph. Graphs without agents acquire no language-model runtime;
 * agent graphs retain dependency validation, invocation and persistence release.
 */
import type { ApplicationGraph } from "@relkit/graph";
import { SERVER_AGENT_REGISTRATION_SOURCE } from "./build-server-registration.js";
import type { ServerAgentSource } from "./build-server.types.js";

/**
 * Emits optional agent wiring without inspecting or executing user descriptors.
 * @param graph - Complete graph accepted by compilation.
 * @returns Pure import/start/registration/release fragments with matching ownership.
 */
export function serverAgentSource(graph: ApplicationGraph): ServerAgentSource {
  if (!graph.nodes.some((node) => node.kind === "agent"))
    return { imports: "", startup: "", registration: "", release: "" };
  return {
    imports:
      'import { assertAgentRuntimeDependencies, createGeneratedAgentFunction, invokeAgent, releaseAgentPersistence } from "@relkit/agents";',
    startup:
      "bindAgents();\nawait assertAgentRuntimeDependencies(Object.values(runtimeManifest.agents ?? {}));",
    registration: SERVER_AGENT_REGISTRATION_SOURCE,
    release:
      'await runtimeOwner.cleanup("agents.release", () => releaseAgentPersistence(Object.values(runtimeManifest.agents ?? {})));',
  };
}
