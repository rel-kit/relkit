import type { OperationId } from "../contracts/index.js";

/** Public agent input validated before domain admission. */
export interface AgentInput {
  readonly agentId: string;
  readonly expectedIdentity?: import("../contracts/index.js").ExpectedClientIdentity;
  readonly threadId?: string;
  readonly resume?: boolean;
  readonly waitingRevision?: string;
  readonly runId?: string;
  readonly operationId?: OperationId;
  readonly kind?: string;
  readonly payload?: unknown;
  readonly after?: unknown;
  readonly requestDigest?: string;
  readonly snapshotId?: string;
  readonly cursor?: string;
}
