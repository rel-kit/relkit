import type { BrowserMessage } from "./agent-content.js";
import type { AgentExecutionSnapshot } from "./agent-execution.js";
import type { ExpectedClientIdentity, OperationId } from "./client.js";
import type { JsonValue } from "./json.js";

export type ThreadStatus =
  "idle" | "running" | "waiting" | "approval-interrupted" | "stopping" | "worker-interrupted";
export type RunStatus =
  | "accepted"
  | "running"
  | "waiting"
  | "approval-interrupted"
  | "stopping"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "worker-interrupted";
export interface RunOwner {
  readonly generationId: string;
  readonly publicFingerprint: string;
  readonly protocolVersion: number;
  readonly schemaVersion: number;
  readonly providerScope: string;
}
export interface StoredRunRouting {
  readonly runId: string;
  readonly threadId: string;
  readonly owner: RunOwner;
}
export interface StoredThread {
  readonly threadId: string;
  readonly agentId: string;
  readonly ownerScope: string;
  readonly status: ThreadStatus;
  readonly revision: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface ThreadListItem extends StoredThread {
  readonly preview?: string;
}
export interface StoredRun extends StoredRunRouting {
  readonly operationId: OperationId;
  readonly status: RunStatus;
  readonly inputDigest: string;
  readonly acceptedAt: string;
  readonly settledAt?: string;
  readonly outcome?: "succeeded" | "failed" | "cancelled" | "worker-interrupted";
}
export interface AgentRunCompatibility {
  readonly runtime: "native" | "ai-sdk";
  readonly access: "read-write" | "read-only";
  readonly resumableCheckpoint: boolean;
  readonly protocolVersion?: number;
  readonly schemaVersion?: number;
}
export interface StoredApproval {
  readonly approvalId: string;
  readonly runId: string;
  readonly interruptSetDigest: string;
  readonly interruptSetSize?: number;
  readonly status: "open" | "approved" | "denied" | "cancelled";
  readonly publicRequest: unknown;
}
export type ControlStatus = "accepted" | "processing" | "applied" | "rejected" | "cancelled";
export type ControlEffectOutcome = "not-started" | "confirmed" | "unknown";
export interface ControlRecord {
  readonly controlId: OperationId;
  readonly runId: string;
  readonly kind: "steer" | "follow-up" | "stop" | "approve";
  readonly semanticDigest: string;
  readonly publicPayload?: unknown;
  readonly status: ControlStatus;
  readonly effect: ControlEffectOutcome;
  readonly acceptedAt: string;
  readonly settledAt?: string;
}
export interface JournalCheckpoint {
  readonly applicationId: string;
  readonly environment: string;
  readonly profile: string;
  readonly providerEpoch: string;
  readonly threadId: string;
  readonly sequence: string;
}
export interface JournalRecord {
  readonly recordId: string;
  readonly runId: string;
  readonly kind:
    "message" | "progress" | "approval" | "control" | "terminal" | "interruption" | "event";
  readonly publicValue: unknown;
  readonly checkpoint: JournalCheckpoint;
  readonly encodedBytes: number;
  readonly createdAt: string;
}
export interface AgentWaitingRequest {
  readonly node: string;
  readonly value?: unknown;
  readonly response: JsonValue;
}
export interface AgentWaitingState {
  readonly revision: string;
  readonly runId: string;
  readonly response: JsonValue;
  readonly requests: readonly AgentWaitingRequest[];
}
export interface ThreadSnapshot {
  readonly snapshotId: string;
  readonly thread: StoredThread;
  readonly activeRun: StoredRunRouting | undefined;
  readonly currentRuns: readonly StoredRun[];
  readonly currentMessages: readonly BrowserMessage[];
  readonly values?: unknown;
  readonly output?: unknown;
  readonly executions: readonly AgentExecutionSnapshot[];
  readonly approvals: readonly StoredApproval[];
  readonly controls: readonly ControlRecord[];
  readonly waiting?: AgentWaitingState;
  readonly checkpoint: JournalCheckpoint;
  readonly providerEpoch: string;
  readonly hasOlderHistory: boolean;
  readonly olderHistoryCursor?: string;
  readonly compatibility?: AgentRunCompatibility;
}
export interface AgentRequestScope extends ExpectedClientIdentity {
  readonly applicationId: string;
  readonly environment: string;
  readonly profile: string;
  readonly providerEpoch: string;
  readonly agentId: string;
  readonly ownerScope: string;
  readonly authorizationGrantId: string;
}
export interface ExecutionClaim {
  readonly claimId: string;
  readonly runId: string;
  readonly workerId: string;
  readonly generationId: string;
  readonly fence: number;
  readonly expiresAt: string;
}
export interface ControlClaim {
  readonly claimId: string;
  readonly controlId: OperationId;
  readonly workerId: string;
  readonly generationId: string;
  readonly fence: number;
  readonly expiresAt: string;
}
