import type { BrowserMessage } from "./agent-content.js";
import type { AgentExecutionSnapshot } from "./agent-execution.js";
import type { ExpectedClientIdentity, OperationId } from "./client.js";
import type { JsonValue } from "./json.js";

/** Current scheduling state of an agent thread. */
export type ThreadStatus =
  "idle" | "running" | "waiting" | "approval-interrupted" | "stopping" | "worker-interrupted";
/** Persisted lifecycle state of an agent run. */
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
/** Runtime generation and provider scope that own a run. */
export interface RunOwner {
  readonly generationId: string;
  readonly publicFingerprint: string;
  readonly protocolVersion: number;
  readonly schemaVersion: number;
  readonly providerScope: string;
}
/** Minimal routing data needed to locate a stored run. */
export interface StoredRunRouting {
  readonly runId: string;
  readonly threadId: string;
  readonly owner: RunOwner;
}
/** Durable thread metadata stored by the state provider. */
export interface StoredThread {
  readonly threadId: string;
  readonly agentId: string;
  readonly ownerScope: string;
  readonly status: ThreadStatus;
  readonly revision: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
/** Thread metadata enriched with a client-facing preview. */
export interface ThreadListItem extends StoredThread {
  readonly preview?: string;
}
/** Durable run state and idempotent submission identity. */
export interface StoredRun extends StoredRunRouting {
  readonly operationId: OperationId;
  readonly status: RunStatus;
  readonly inputDigest: string;
  readonly acceptedAt: string;
  readonly settledAt?: string;
  readonly outcome?: "succeeded" | "failed" | "cancelled" | "worker-interrupted";
}
/** Compatibility level available when replaying a run. */
export interface AgentRunCompatibility {
  readonly runtime: "native" | "ai-sdk";
  readonly access: "read-write" | "read-only";
  readonly resumableCheckpoint: boolean;
  readonly protocolVersion?: number;
  readonly schemaVersion?: number;
}
/** Durable approval decision associated with a run interruption. */
export interface StoredApproval {
  readonly approvalId: string;
  readonly runId: string;
  readonly interruptSetDigest: string;
  readonly interruptSetSize?: number;
  readonly status: "open" | "approved" | "denied" | "cancelled";
  readonly publicRequest: unknown;
}
/** Persistence lifecycle of a control request. */
export type ControlStatus = "accepted" | "processing" | "applied" | "rejected" | "cancelled";
/** Whether a control's external effect is known to have occurred. */
export type ControlEffectOutcome = "not-started" | "confirmed" | "unknown";
/** Durable idempotent control request and its application outcome. */
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
/** Provider-scoped cursor for replaying the agent journal. */
export interface JournalCheckpoint {
  readonly applicationId: string;
  readonly environment: string;
  readonly profile: string;
  readonly providerEpoch: string;
  readonly threadId: string;
  readonly sequence: string;
}
/** One encoded public record in the agent journal. */
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
/** Input and expected response for a paused execution node. */
export interface AgentWaitingRequest {
  readonly node: string;
  readonly value?: unknown;
  readonly response: JsonValue;
}
/** Durable collection of requests awaiting external responses. */
export interface AgentWaitingState {
  readonly revision: string;
  readonly runId: string;
  readonly response: JsonValue;
  readonly requests: readonly AgentWaitingRequest[];
}
/** Public thread view rebuilt from current state and journal data. */
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
/** Authorization and provider scope carried by an agent request. */
export interface AgentRequestScope extends ExpectedClientIdentity {
  readonly applicationId: string;
  readonly environment: string;
  readonly profile: string;
  readonly providerEpoch: string;
  readonly agentId: string;
  readonly ownerScope: string;
  readonly authorizationGrantId: string;
}
/** Fenced worker lease for executing one run. */
export interface ExecutionClaim {
  readonly claimId: string;
  readonly runId: string;
  readonly workerId: string;
  readonly generationId: string;
  readonly fence: number;
  readonly expiresAt: string;
}
/** Fenced worker lease for applying one control request. */
export interface ControlClaim {
  readonly claimId: string;
  readonly controlId: OperationId;
  readonly workerId: string;
  readonly generationId: string;
  readonly fence: number;
  readonly expiresAt: string;
}
