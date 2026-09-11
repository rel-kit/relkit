import type { AgentRequestScope, JournalCheckpoint } from "@relkit/agents";
import { REALTIME_RUNTIME_LIMITS } from "@relkit/contracts";
import { operationIdTimestamp } from "@relkit/realtime";
import type { LocalAgentState, LocalAgentThread, StoredReceipt } from "./state.js";

export class LocalAgentStateError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function scopeKey(scope: AgentRequestScope): string {
  return JSON.stringify([
    scope.applicationId,
    scope.environment,
    scope.profile,
    scope.agentId,
    scope.ownerScope,
  ]);
}

export function threadStorageKey(scope: AgentRequestScope, threadId: string): string {
  if (typeof threadId !== "string" || threadId.trim().length === 0) {
    throw new LocalAgentStateError("INVALID_THREAD_ID", "Thread ID must not be empty.");
  }
  return storedThreadKey(scopeKey(scope), threadId);
}

export function storedThreadKey(ownerKey: string, threadId: string): string {
  return JSON.stringify([ownerKey, threadId]);
}

export function operationStorageKey(scope: AgentRequestScope, operationId: string): string {
  return JSON.stringify([scopeKey(scope), operationId]);
}

export function ownedThread(
  state: LocalAgentState,
  scope: AgentRequestScope,
  threadId: string,
): LocalAgentThread {
  const thread = state.threads[threadStorageKey(scope, threadId)];
  if (thread === undefined) {
    throw new LocalAgentStateError("NOT_FOUND", "Thread was not found.");
  }
  if (scope.providerEpoch !== state.providerEpoch) {
    throw new LocalAgentStateError("PROVIDER_STATE_LOST", "Agent provider epoch changed.");
  }
  return thread;
}

export function checkpoint(
  state: LocalAgentState,
  scope: AgentRequestScope,
  threadId: string,
  sequence: number,
): JournalCheckpoint {
  return {
    applicationId: scope.applicationId,
    environment: scope.environment,
    profile: scope.profile,
    providerEpoch: state.providerEpoch,
    threadId,
    sequence: String(sequence),
  };
}

export function encodedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function activeClaim<
  Claim extends { readonly claimId: string; readonly fence: number; readonly expiresAt: string },
>(stored: Claim | undefined, supplied: Claim): Claim {
  if (
    stored === undefined ||
    stored.claimId !== supplied.claimId ||
    stored.fence !== supplied.fence ||
    Date.parse(stored.expiresAt) <= Date.now()
  ) {
    throw new LocalAgentStateError("CLAIM_LOST", "Execution ownership was lost.");
  }
  return stored;
}

export function lookupReceipt<Value>(
  receipt: StoredReceipt<Value> | undefined,
  semanticDigest: string,
  now: string,
) {
  if (receipt === undefined) return undefined;
  if (receipt.semanticDigest !== semanticDigest) {
    throw new LocalAgentStateError("IDEMPOTENCY_CONFLICT", "Operation ID content conflicts.");
  }
  return Date.parse(receipt.expiresAt) <= Date.parse(now) ? "expired" : receipt.value;
}

export function expiredOperationReceipt(operationId: string, now: string) {
  const expiredAt = operationIdTimestamp(operationId) + REALTIME_RUNTIME_LIMITS.agentReceiptMs;
  return expiredAt <= Date.parse(now)
    ? { status: "expired" as const, expiredAt: new Date(expiredAt).toISOString() }
    : undefined;
}

export function assertOperationReceiptFresh(operationId: string, now: string): void {
  if (expiredOperationReceipt(operationId, now) !== undefined) {
    throw new LocalAgentStateError(
      "IDEMPOTENCY_WINDOW_EXPIRED",
      "Operation is outside the receipt window.",
    );
  }
}
