/** Runtime entry of the AI SDK adapter: the generated server imports it only for agents that select `aiSdk()`. */
import type { RuntimeIntegrationModuleMetadata } from "relkit/contracts";

export { aiSdkAgentRuntime } from "../adapter-runtime.js";
export { invokeAgentFunction } from "../runtime-invoke.js";
export type { AiSdkInvocationOptions } from "../runtime-invoke.types.js";
export { createGeneratedAgentFunction } from "relkit/agents/generated-function";

/** @experimental */
export const runtimeIntegration = Object.freeze({
  kind: "runtime-integration",
  integrationId: "ai-sdk",
  registrations: Object.freeze([
    { capability: "agent-execution", adapterId: "ai-sdk", protocolVersion: 1 },
  ]),
}) satisfies RuntimeIntegrationModuleMetadata;

/**
 * Confirms the AI SDK package can be loaded before the server accepts requests.
 * @param agents - Agents that select this adapter.
 * @returns Nothing once the SDK is importable.
 * @example await assertAgentRuntimeDependencies([]);
 * @experimental
 */
export async function assertAgentRuntimeDependencies(agents: readonly unknown[]): Promise<void> {
  if (agents.length > 0) await import("ai");
}

/**
 * Releases adapter-owned persistence; AI SDK agents keep their threads in RelKit's agent state.
 * @param agents - Agents that select this adapter.
 * @returns Nothing.
 * @example await releaseAgentPersistence([]);
 * @experimental
 */
export async function releaseAgentPersistence(agents: readonly unknown[]): Promise<void> {
  void agents;
}
