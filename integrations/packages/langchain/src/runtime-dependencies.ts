/** Exposes dependency preflight without making optional DeepAgents declarations part of ordinary native authoring. */
import { assertAgentRuntimeDependencies as assertNativeDependencies } from "./runtime-native-support.js";
import type { AgentDescriptor } from "./define-agent.js";

/** Checks selected native capabilities and preserves the original loader failure and lifecycle.
 * @param agents - Authored native agent descriptors whose requested capabilities determine peers.
 * @returns The existing owned dependency check; optional native modules load only when selected.
 */
export function assertAgentRuntimeDependencies(
  agents: readonly AgentDescriptor<string, unknown, unknown>[],
): Promise<void> {
  return assertNativeDependencies(agents);
}
