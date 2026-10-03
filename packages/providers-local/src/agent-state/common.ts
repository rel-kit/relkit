import type { AgentRequestScope, JournalCheckpoint } from "@relkit/agents";
import { REALTIME_RUNTIME_LIMITS } from "@relkit/contracts";
import { operationIdTimestamp } from "@relkit/realtime";
import type { LocalAgentState, LocalAgentThread, StoredReceipt } from "./state.js";

/** Preserves the public local agent state error identity and stable error code. */
export class LocalAgentStateError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Encodes the application, environment and scope into a stable partition identity.
 * @param scope - Application, environment and caller scope.
 * @returns The canonical scope partition identity.
 */
export function scopeKey(scope: AgentRequestScope): string {
  return JSON.stringify([
    scope.applicationId,
    scope.environment,
    scope.profile,
    scope.agentId,
    scope.ownerScope,
  ]);
}

/**
 * Combines request scope and thread ID into an unambiguous storage key.
 * @param scope - Application, environment and caller scope.
 * @param threadId - Thread identity within the scope.
 * @returns The scoped thread storage identity.
 */
export function threadStorageKey(scope: AgentRequestScope, threadId: string): string {
  if (typeof threadId !== "string" || threadId.trim().length === 0) {
    throw new LocalAgentStateError("INVALID_THREAD_ID", "Thread ID must not be empty.");
  }
  return storedThreadKey(scopeKey(scope), threadId);
}

/**
 * Combines a persisted scope key and thread ID into a storage key.
 * @param threadId - Thread identity within the scope.
 * @param ownerKey - Stable ownership key.
 * @returns The persisted scoped thread identity.
 */
export function storedThreadKey(ownerKey: string, threadId: string): string {
  return JSON.stringify([ownerKey, threadId]);
}

/**
 * Combines request scope and operation ID for receipt deduplication.
 * @param scope - Application, environment and caller scope.
 * @param operationId - Caller operation identity.
 * @returns The scoped operation receipt identity.
 */
export function operationStorageKey(scope: AgentRequestScope, operationId: string): string {
  return JSON.stringify([scopeKey(scope), operationId]);
}

/**
 * Resolves a thread in the requested scope or rejects with the established domain error.
 * @param state - Persisted domain snapshot.
 * @param scope - Application, environment and caller scope.
 * @param threadId - Thread identity within the scope.
 * @returns The requested thread after scope ownership checks.
 */
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

/**
 * Builds the current journal checkpoint from the persisted sequence.
 * @param state - Persisted domain snapshot.
 * @param scope - Application, environment and caller scope.
 * @param threadId - Thread identity within the scope.
 * @param sequence - Monotonic durable record position.
 * @returns The current replay checkpoint.
 */
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

/**
 * Measures canonical JSON bytes for admission limits.
 * @param value - Untrusted or projected value to inspect.
 * @returns The canonical JSON byte count.
 */
export function encodedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/**
 * Validates the supplied ownership claim and rejects expired or stale ownership.
 * @param stored - Persisted ownership claim.
 * @param supplied - Claim presented by the caller.
 * @param now - Current clock time in milliseconds.
 * @returns The stored claim after ownership and expiry checks.
 * @typeParam Claim - Shape preserved by this operation.
 */
export function activeClaim<
  Claim extends { readonly claimId: string; readonly fence: number; readonly expiresAt: string },
>(stored: Claim | undefined, supplied: Claim, now = Date.now()): Claim {
  if (
    stored === undefined ||
    stored.claimId !== supplied.claimId ||
    stored.fence !== supplied.fence ||
    Date.parse(stored.expiresAt) <= now
  ) {
    throw new LocalAgentStateError("CLAIM_LOST", "Execution ownership was lost.");
  }
  return stored;
}

/**
 * Finds a live operation receipt without crossing scope boundaries.
 * @param receipt - Stored acceptance receipt.
 * @param now - Current clock time in milliseconds.
 * @param semanticDigest - Canonical digest used to detect conflicting deduplication requests.
 * @returns The retained scoped receipt when available.
 * @typeParam Value - Shape preserved by this operation.
 */
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

/**
 * Constructs the established rejection for an expired operation receipt.
 * @param operationId - Caller operation identity.
 * @param now - Current clock time in milliseconds.
 * @returns The established expired-receipt rejection.
 */
export function expiredOperationReceipt(operationId: string, now: string) {
  const expiredAt = operationIdTimestamp(operationId) + REALTIME_RUNTIME_LIMITS.agentReceiptMs;
  return expiredAt <= Date.parse(now)
    ? { status: "expired" as const, expiredAt: new Date(expiredAt).toISOString() }
    : undefined;
}

/**
 * Rejects an operation whose receipt-retention window has expired.
 * @param operationId - Caller operation identity.
 * @param now - Current clock time in milliseconds.
 * @returns Nothing; rejects invalid input with the established domain error.
 */
export function assertOperationReceiptFresh(operationId: string, now: string): void {
  if (expiredOperationReceipt(operationId, now) !== undefined) {
    throw new LocalAgentStateError(
      "IDEMPOTENCY_WINDOW_EXPIRED",
      "Operation is outside the receipt window.",
    );
  }
}
