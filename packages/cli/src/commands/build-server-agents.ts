/**
 * Selects generated agent imports and lifecycle operations from the fully
 * validated graph. Graphs without agents acquire no language-model runtime;
 * each agent adapter's runtime entry is imported only when an agent selects it.
 */
import type { ApplicationGraph } from "relkit/graph";
import { SERVER_AGENT_REGISTRATION_SOURCE } from "./build-server-registration.js";
import type { ServerAgentSource } from "./build-server.types.js";

/**
 * Emits optional agent wiring without inspecting or executing user descriptors.
 * @param graph - Complete graph accepted by compilation.
 * @returns Pure import/start/registration/release fragments with matching ownership.
 */
export function serverAgentSource(graph: ApplicationGraph): ServerAgentSource {
  const agents = graph.nodes.filter((node) => node.kind === "agent");
  if (agents.length === 0) return { imports: "", startup: "", registration: "", release: "" };
  const integrations = [
    ...new Set(agents.map((node) => node.runtime?.integrationId ?? "langchain")),
  ].sort();
  const entries = integrations
    .map((id) => `${JSON.stringify(id)}: await import(${JSON.stringify(`@relkit/${id}/runtime`)})`)
    .join(", ");
  return {
    imports: `const agentAdapters = { ${entries} };\nconst { createGeneratedAgentFunction } = Object.values(agentAdapters)[0];`,
    startup:
      "bindAgents();\nfor (const [id, adapter] of Object.entries(agentAdapters)) await adapter.assertAgentRuntimeDependencies(agentsOf(id));",
    registration: SERVER_AGENT_REGISTRATION_SOURCE,
    release:
      'await runtimeOwner.cleanup("agents.release", async () => { for (const [id, adapter] of Object.entries(agentAdapters)) await adapter.releaseAgentPersistence(agentsOf(id)); });',
  };
}
