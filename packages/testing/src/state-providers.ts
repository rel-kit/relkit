import type { AgentStateProvider } from "@relkit/agents";
import {
  createLocalAgentStateProvider,
  createLocalRealtimeProvider,
} from "@relkit/providers-local";
import type { RealtimeProvider } from "@relkit/realtime";

export function createTestRealtimeProvider(root: string): RealtimeProvider {
  return createLocalRealtimeProvider(root);
}

export function createTestAgentStateProvider(root: string): AgentStateProvider {
  return createLocalAgentStateProvider(root);
}
