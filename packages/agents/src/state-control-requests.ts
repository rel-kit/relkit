import type { OperationId } from "@relkit/contracts";
import type { AgentRequestScope, ControlClaim } from "./state-types.js";

export interface ControlLimits {
  readonly maxQueuedPerRun: number;
  readonly maxQueuedPerApplication: number;
}

export interface AcceptControlRequest extends AgentRequestScope {
  readonly operationId: OperationId;
  readonly semanticDigest: string;
  readonly threadId: string;
  readonly runId: string;
  readonly kind: "steer" | "follow-up" | "stop" | "approve";
  readonly publicPayload: unknown;
  readonly acceptedAt: string;
  readonly receiptExpiresAt: string;
  readonly limits: ControlLimits;
}

export interface LookupControlReceiptRequest extends AgentRequestScope {
  readonly operationId: OperationId;
  readonly threadId: string;
  readonly runId: string;
  readonly semanticDigest: string;
  readonly now: string;
}

export interface ReadControlsRequest extends AgentRequestScope {
  readonly threadId: string;
  readonly runId: string;
  readonly afterSequence?: string;
  readonly limit: number;
}

export interface ControlPage {
  readonly operationIds: readonly OperationId[];
  readonly nextSequence: string;
  readonly hasMore: boolean;
}

export interface WaitForControlsRequest extends AgentRequestScope {
  readonly threadId: string;
  readonly runId: string;
  readonly afterSequence: string;
  readonly deadlineMs: number;
  readonly signal: AbortSignal;
}

export interface ClaimControlRequest extends AgentRequestScope {
  readonly threadId: string;
  readonly runId: string;
  readonly operationId: OperationId;
  readonly workerId: string;
  readonly generationId: string;
  readonly expiresAt: string;
}

export interface RenewControlClaimRequest extends AgentRequestScope {
  readonly threadId: string;
  readonly runId: string;
  readonly claim: ControlClaim;
  readonly expiresAt: string;
}

export interface MarkControlEffectStartedRequest extends AgentRequestScope {
  readonly threadId: string;
  readonly runId: string;
  readonly claim: ControlClaim;
  readonly operationId: OperationId;
  readonly downstreamOperationId?: OperationId;
}

export interface SettleControlRequest extends AgentRequestScope {
  readonly threadId: string;
  readonly runId: string;
  readonly claim: ControlClaim;
  readonly operationId: OperationId;
  readonly status: "applied" | "rejected" | "cancelled";
  readonly effect: "not-started" | "confirmed" | "unknown";
  readonly downstreamOperationId?: OperationId;
  readonly settledAt: string;
}

export interface RecoverAbandonedControlRequest extends AgentRequestScope {
  readonly threadId: string;
  readonly runId: string;
  readonly operationId: OperationId;
  readonly expectedClaimId: string;
  readonly expectedFence: number;
  readonly recoveredAt: string;
}

export interface ContinuationIdentity {
  readonly threadId: string;
  readonly interruptedRunId: string;
  readonly interruptSetDigest: string;
}

interface ContinuationAdmission extends AgentRequestScope, ContinuationIdentity {
  readonly operationId: OperationId;
  readonly semanticDigest: string;
  readonly admittedAt: string;
  readonly receiptExpiresAt: string;
}

export type AdmitContinuationRequest = ContinuationAdmission &
  (
    | {
        readonly kind: "approval";
        readonly decisions: Readonly<Record<string, "approve" | "deny">>;
      }
    | { readonly kind: "resume"; readonly waitingRevision: string }
  );

export interface LookupContinuationReceiptRequest extends AgentRequestScope {
  readonly operationId: OperationId;
  readonly threadId: string;
  readonly interruptedRunId?: string;
  readonly interruptSetDigest?: string;
  readonly semanticDigest: string;
  readonly now: string;
}
