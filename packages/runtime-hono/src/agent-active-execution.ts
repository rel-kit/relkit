import type { AcceptRunReceipt, ExecutionClaim } from "@relkit/agents";

export interface ActiveAgentExecution {
  receipt: AcceptRunReceipt;
  claim: ExecutionClaim;
  readonly controlRunIds: string[];
  readonly steering: AgentSteeringBuffer;
}

export interface AgentSteeringBuffer {
  readonly push: (message: string) => void;
  readonly drain: () => readonly string[];
}

export function createAgentSteeringBuffer(): AgentSteeringBuffer {
  const pending: string[] = [];
  return Object.freeze({
    push: (message: string) => pending.push(message),
    drain: () => pending.splice(0),
  });
}
