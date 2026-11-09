import type { PendingOperationMetadata } from "relkit/contracts";
import { canonicalJson, createOperationId } from "../wire.js";
import {
  PENDING_PREFIX,
  pendingMemory,
  pendingEntryKey,
  readPendingStorage,
  writePendingStorage,
  removePendingStorage,
  clearPendingStorage,
  sessionStorageValue,
  type PendingStorage,
} from "./pending-store.js";
import {
  MAX_JOB_INTENTS,
  PendingCapacityError,
  PendingRecoveryUnavailableError,
  PendingRequestMismatchError,
} from "./pending-errors.js";
import type { PendingOperationService } from "./pending.types.js";

/** Memory and persistence an isolated pending-operation service uses. */
export interface PendingOperationsOptions {
  /** Memory-only receipts and retained requests; defaults to the browser-wide map. */
  readonly memory?: typeof pendingMemory;
  /** Persistence for receipt metadata; defaults to browser session storage. */
  readonly storage?: PendingStorage;
}

/**
 * Creates pending-operation state; storage remains a best-effort native persistence edge.
 * @param options - Memory and storage, replaced by isolated values in tests.
 * @returns A service with synchronous state decisions and Promise hashing.
 * @example
 * ```ts
 * import { createPendingOperations } from "./pending.service.js";
 * const pending = createPendingOperations({ memory: new Map(), storage: () => undefined });
 * export const digest = pending.digest({ input: 1 });
 * ```
 * @see packages/client/tests/transport/examples.test.ts for the checked example.
 */
export function createPendingOperations(
  options: PendingOperationsOptions = {},
): PendingOperationService {
  const memory = options.memory ?? pendingMemory;
  const storage = options.storage ?? sessionStorageValue;
  /** Merges memory and weakly validated persistence without transmitting inputs.
   * @param scope - Complete pending registry scope.
   * @returns Metadata indexed by the existing operation identity. */
  const list = (scope: string): PendingOperationMetadata[] => {
    const result = readPendingStorage(scope, storage);
    for (const [key, value] of memory)
      if (key.startsWith(`${PENDING_PREFIX}${scope}.`))
        result.set(value.metadata.operationId, value.metadata);
    return [...result.values()];
  };
  /** Hashes the canonical transmitted value before dispatch can begin.
   * @param value - Borrowed request, retained only by opted-in memory state.
   * @returns Its SHA-256 receipt digest. */
  const digest = async (value: unknown): Promise<string> => {
    const bytes = new TextEncoder().encode(canonicalJson(value));
    // WebCrypto does not accept AbortSignal; no submission can occur until hashing completes.
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return `sha256:${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  };
  return {
    list,
    digest,
    update: (scope, value) => {
      const key = pendingEntryKey(scope, value.operationId);
      const previous = memory.get(key);
      memory.set(key, {
        metadata: value,
        ...(previous?.request === undefined ? {} : { request: previous.request }),
      });
      writePendingStorage(key, value, storage);
    },
    remember: async (scope, kind, resource, value, references, settings) => {
      const operationId = (settings.operationId ??
        createOperationId()) as PendingOperationMetadata["operationId"];
      assertCapacity(list(scope), operationId, kind);
      const requestDigest = await digest(value);
      const now = Date.now();
      // Hashing yields. Re-check capacity/reuse immediately before the synchronous write so
      // simultaneous submissions cannot overfill the unresolved registry.
      const current = list(scope);
      assertCapacity(current, operationId, kind);
      const existing = current.find((entry) => entry.operationId === operationId);
      if (
        kind === "job-trigger" &&
        existing !== undefined &&
        existing.requestDigest !== requestDigest
      )
        throw new PendingRequestMismatchError();
      if (
        kind === "job-trigger" &&
        existing?.state === "unknown" &&
        !(
          existing.recovery?.action === "retry-with-same-key" &&
          (existing.recovery.expiresAt === undefined ||
            Date.parse(existing.recovery.expiresAt) > now)
        )
      )
        throw new PendingRecoveryUnavailableError();
      const metadata: PendingOperationMetadata = {
        operationId,
        kind,
        resourceId: resource,
        ...references,
        requestDigest,
        submittedAt: new Date(now).toISOString(),
        state: "submitted",
        ...(settings.idempotencyKey === undefined
          ? {}
          : { idempotencyKey: settings.idempotencyKey }),
        ...(settings.recovery === undefined ? {} : { recovery: settings.recovery }),
      };
      const key = pendingEntryKey(scope, operationId);
      memory.set(key, { metadata, ...(settings.retainRequest === true ? { request: value } : {}) });
      writePendingStorage(key, metadata, storage);
      return metadata;
    },
    forget: (scope, id) => {
      memory.delete(pendingEntryKey(scope, id));
      removePendingStorage(pendingEntryKey(scope, id), storage);
    },
    request: (scope, id) => memory.get(pendingEntryKey(scope, id))?.request,
    clear: (scope) => {
      for (const key of [...memory.keys()])
        if (key.startsWith(`${PENDING_PREFIX}${scope}.`)) memory.delete(key);
      clearPendingStorage(scope, storage);
    },
    matches: async (scope, id, value) => {
      const metadata = list(scope).find((entry) => entry.operationId === id);
      return metadata !== undefined && metadata.requestDigest === (await digest(value));
    },
  };
}

/** The browser-wide pending-operation service over session storage and shared memory. */
export const pendingOperations: PendingOperationService = createPendingOperations();

/**
 * Checks the unresolved job limit without evicting existing recovery authority.
 * @param entries - Existing persisted and memory metadata.
 * @param operationId - Proposed receipt identity.
 * @param kind - Submission kind; only job intents have this bound.
 * @returns Nothing when reuse or insertion is permitted.
 * @throws PendingCapacityError when a new job would exceed the existing limit.
 */
function assertCapacity(
  entries: readonly PendingOperationMetadata[],
  operationId: string,
  kind: PendingOperationMetadata["kind"],
): void {
  if (
    kind === "job-trigger" &&
    !entries.some((entry) => entry.operationId === operationId) &&
    entries.filter((entry) => entry.kind === "job-trigger").length >= MAX_JOB_INTENTS
  )
    throw new PendingCapacityError();
}
