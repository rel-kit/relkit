import type { OperationId } from "@relkit/contracts";
import type {
  AgentRequestScope,
  AgentWaitingState,
  BrowserMessage,
  ExecutionClaim,
  JournalCheckpoint,
  JournalRecord,
  RunOwner,
  ThreadListItem,
} from "./state-types.js";

export interface AgentStateLimits {
  readonly maxSnapshotBytes: number;
  readonly maxHistoryPageBytes: number;
  readonly maxJournalRecordBytes: number;
  readonly maxJournalBytesPerThread: number;
  readonly maxStateBytesPerApplication: number;
  readonly maxThreadsPerPrincipal: number;
  readonly maxActiveRunsPerPrincipal: number;
  readonly maxActiveRunsPerApplication: number;
  readonly terminalReserveBytes: number;
  readonly terminalReserveRecords: number;
}

export interface CreateThreadRequest extends AgentRequestScope {
  readonly operationId: OperationId;
  readonly threadId: string;
  readonly semanticDigest: string;
  readonly now: string;
  readonly limits: AgentStateLimits;
}

export interface LoadThreadRequest extends AgentRequestScope {
  readonly threadId: string;
  readonly maxEncodedBytes: number;
}

export interface ListThreadsRequest extends AgentRequestScope {
  readonly limit: number;
}

export interface ThreadList {
  readonly threads: readonly ThreadListItem[];
}

export interface ReadSnapshotHistoryRequest extends AgentRequestScope {
  readonly threadId: string;
  readonly snapshotId: string;
  readonly cursor: string;
  readonly maxEncodedBytes: number;
}

export interface SnapshotHistoryPage {
  readonly messages: readonly BrowserMessage[];
  readonly nextCursor?: string;
}

export interface AcceptRunRequest extends AgentRequestScope {
  readonly operationId: OperationId;
  readonly semanticDigest: string;
  readonly threadId: string;
  readonly owner: RunOwner;
  readonly input: unknown;
  readonly inputDigest: string;
  readonly acceptedAt: string;
  readonly receiptExpiresAt: string;
  readonly limits: AgentStateLimits;
}

export interface LookupRunReceiptRequest extends AgentRequestScope {
  readonly operationId: OperationId;
  readonly threadId?: string;
  readonly runId?: string;
  readonly semanticDigest: string;
  readonly now: string;
}

export interface ReadJournalRequest extends AgentRequestScope {
  readonly threadId: string;
  readonly after: JournalCheckpoint;
  readonly limit: number;
  readonly maxEncodedBytes: number;
}

export interface JournalPage {
  readonly records: readonly JournalRecord[];
  readonly checkpoint: JournalCheckpoint;
  readonly hasMore: boolean;
  readonly gap?: "expired" | "foreign" | "future" | "session" | "provider-reset";
}

export interface WaitForJournalRequest extends AgentRequestScope {
  readonly threadId: string;
  readonly after: JournalCheckpoint;
  readonly deadlineMs: number;
  readonly signal: AbortSignal;
}

export interface ClaimRunRequest extends AgentRequestScope {
  readonly threadId: string;
  readonly runId: string;
  readonly workerId: string;
  readonly generationId: string;
  readonly expiresAt: string;
}

export interface RenewRunClaimRequest extends AgentRequestScope {
  readonly threadId: string;
  readonly runId: string;
  readonly claim: ExecutionClaim;
  readonly expiresAt: string;
}

export interface AppendJournalRequest extends AgentRequestScope {
  readonly threadId: string;
  readonly runId: string;
  readonly claim: ExecutionClaim;
  readonly operationId: OperationId;
  readonly semanticDigest: string;
  readonly record: Omit<JournalRecord, "checkpoint">;
  readonly limits: AgentStateLimits;
}

export interface CompleteRunRequest extends AgentRequestScope {
  readonly operationId: OperationId;
  readonly semanticDigest: string;
  readonly threadId: string;
  readonly runId: string;
  readonly claim: ExecutionClaim;
  readonly outcome: "succeeded" | "failed" | "cancelled";
  readonly terminalRecord: Omit<JournalRecord, "checkpoint">;
  readonly settledAt: string;
  readonly receiptExpiresAt: string;
}

export interface SuspendRunRequest extends AgentRequestScope {
  readonly operationId: OperationId;
  readonly threadId: string;
  readonly runId: string;
  readonly claim: ExecutionClaim;
  readonly waiting: Omit<AgentWaitingState, "revision">;
  readonly suspendedAt: string;
}

export interface InterruptOwnedRunRequest extends AgentRequestScope {
  readonly operationId: OperationId;
  readonly threadId: string;
  readonly runId: string;
  readonly expectedOwner: RunOwner;
  readonly expectedClaimId: string;
  readonly expectedFence: number;
  readonly reason: "claim-expired" | "generation-unavailable" | "process-lost";
  readonly interruptedAt: string;
}
