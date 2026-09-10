import type { AgentDescriptor } from "./define-agent.js";
import { hasDeepAgentCapabilities } from "./define-agent-deep.js";
import { AgentRuntimeError } from "./runtime-errors.js";
import type { NativeTools } from "./runtime-native-tools.js";

export function combineNativeTools(groups: readonly NativeTools[]): NativeTools {
  const publicIds = new Map<string, string>();
  const relkitNames = new Set<string>();
  for (const group of groups) {
    for (const [name, id] of group.publicIds) publicIds.set(name, id);
    for (const name of group.relkitNames) relkitNames.add(name);
  }
  return {
    values: groups[0]!.values,
    publicIds,
    relkitNames,
    failure: () => groups.map((group) => group.failure()).find((failure) => failure !== undefined),
  };
}

export function nativeInstructions(agent: AgentDescriptor<string, unknown, unknown>): string {
  const value = agent.instructions;
  if (typeof value === "string") return value;
  if ("template" in value) return value.template;
  return typeof value.value === "string" ? value.value : value.value.join("\n\n");
}

export async function loadDeepAgents(): Promise<typeof import("deepagents")> {
  try {
    return await import("deepagents");
  } catch {
    throw new AgentRuntimeError(
      "RELKIT_DEEPAGENTS_UNAVAILABLE",
      "DeepAgents capabilities require the application dependency deepagents@1.13.3",
    );
  }
}

export async function assertAgentRuntimeDependencies(
  agents: readonly AgentDescriptor<string, unknown, unknown>[],
): Promise<void> {
  if (agents.some(hasDeepAgentCapabilities)) await loadDeepAgents();
}
