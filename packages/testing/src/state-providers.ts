import type { AgentStateProvider } from "@relkit/agents";
import {
  createLocalAgentStateProvider,
  createLocalRealtimeProvider,
} from "@relkit/providers-local";
import type { RealtimeProvider } from "@relkit/realtime";

/**
 * Constructs the native local realtime provider at an explicit test root.
 * @param root - Explicit source project or persistence root.
 * @returns The unchanged native provider boundary.
 */
export function createTestRealtimeProvider(root: string): RealtimeProvider {
  return createLocalRealtimeProvider(root);
}

/**
 * Constructs the native local agent state provider at an explicit test root.
 * @param root - Explicit source project or persistence root.
 * @returns The unchanged native provider boundary.
 */
export function createTestAgentStateProvider(root: string): AgentStateProvider {
  return createLocalAgentStateProvider(root);
}
