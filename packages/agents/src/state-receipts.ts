import type { OperationId, ReceiptLookup } from "@relkit/contracts";
import type {
  ControlEffectOutcome,
  ControlStatus,
  JournalCheckpoint,
  RunStatus,
  AgentWaitingState,
} from "./state-types.js";

export interface CreateThreadReceipt {
  readonly threadId: string;
  readonly ownerScope: string;
  readonly createdAt: string;
}

export interface AcceptRunReceipt {
  readonly operationId: OperationId;
  readonly threadId: string;
  readonly runId: string;
  readonly status: "accepted";
  readonly duplicate: boolean;
}

export interface JournalReceipt {
  readonly recordId: string;
  readonly checkpoint: JournalCheckpoint;
  readonly duplicate: boolean;
}

export interface CompletionReceipt {
  readonly operationId: OperationId;
  readonly threadId: string;
  readonly runId: string;
  readonly status: Extract<RunStatus, "succeeded" | "failed" | "cancelled">;
  readonly checkpoint: JournalCheckpoint;
  readonly duplicate: boolean;
}

export interface InterruptionReceipt {
  readonly threadId: string;
  readonly runId: string;
  readonly status: "worker-interrupted";
  readonly checkpoint: JournalCheckpoint;
  readonly changed: boolean;
}

export interface SuspensionReceipt {
  readonly threadId: string;
  readonly runId: string;
  readonly status: "waiting";
  readonly checkpoint: JournalCheckpoint;
  readonly waiting: AgentWaitingState;
}

export interface ControlReceipt {
  readonly operationId: OperationId;
  readonly threadId: string;
  readonly runId: string;
  readonly status: ControlStatus;
  readonly effect: ControlEffectOutcome;
  readonly duplicate: boolean;
}

export interface ContinuationReceipt {
  readonly operationId: OperationId;
  readonly threadId: string;
  readonly interruptedRunId: string;
  readonly runId: string;
  readonly interruptSetDigest: string;
  readonly waitingRevision?: string;
  readonly duplicate: boolean;
}

export type RunReceiptLookup = ReceiptLookup<AcceptRunReceipt | CompletionReceipt>;
export type ControlReceiptLookup = ReceiptLookup<ControlReceipt>;
export type ContinuationReceiptLookup = ReceiptLookup<ContinuationReceipt>;
