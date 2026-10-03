import type { AcceptRunReceipt, ExecutionClaim } from "@relkit/agents";

/** Contract for active agent execution used by agent active execution. */
export interface ActiveAgentExecution {
  receipt: AcceptRunReceipt;
  claim: ExecutionClaim;
  readonly controlRunIds: string[];
  readonly steering: AgentSteeringBuffer;
}

/** Contract for agent steering buffer used by agent active execution. */
export interface AgentSteeringBuffer {
  readonly push: (message: string) => void;
  readonly drain: () => readonly string[];
}
