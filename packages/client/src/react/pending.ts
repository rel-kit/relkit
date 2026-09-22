import { canonicalJson, type PendingOperationMetadata } from "@relkit/contracts";
import type { JobUnknownOutcome } from "@relkit/contracts/jobs";
import { createOperationId } from "@relkit/realtime/operation-id";
import type { RelkitKeyScope } from "./keys.js";
import {
  PENDING_PREFIX,
  clearPendingStorage,
  pendingEntryKey,
  pendingMemory,
  readPendingStorage,
  removePendingStorage,
  writePendingStorage,
} from "./pending-store.js";
import {
  MAX_JOB_INTENTS,
  PendingCapacityError,
  PendingRecoveryUnavailableError,
  PendingRequestMismatchError,
} from "./pending-errors.js";
import { candidates, isRecord } from "./pending-support.js";
export {
  PendingCapacityError,
  PendingRecoveryUnavailableError,
  PendingRequestMismatchError,
} from "./pending-errors.js";

export interface PendingRememberOptions {
  readonly operationId?: string;
  readonly idempotencyKey?: string;
  readonly recovery?: JobUnknownOutcome["recovery"];
  readonly retainRequest?: boolean;
}

export function pendingScopeKey(scope: RelkitKeyScope): string {
  return JSON.stringify(scope);
}

export async function rememberPending(
  scopeKey: string,
  kind: PendingOperationMetadata["kind"],
  resourceId: string,
  value: unknown,
  references: Pick<PendingOperationMetadata, "threadId" | "runId"> = {},
  options: PendingRememberOptions = {},
): Promise<PendingOperationMetadata> {
  const operationId = (options.operationId ??
    createOperationId()) as PendingOperationMetadata["operationId"];
  const existingMetadata = pendingOperations(scopeKey).find(
    (entry) => entry.operationId === operationId,
  );
  if (
    kind === "job-trigger" &&
    existingMetadata === undefined &&
    jobIntentCount(scopeKey) >= MAX_JOB_INTENTS
  ) {
    throw new PendingCapacityError();
  }
  const requestDigest = await digestPendingRequest(value);
  if (
    kind === "job-trigger" &&
    existingMetadata !== undefined &&
    existingMetadata.requestDigest !== requestDigest
  ) {
    throw new PendingRequestMismatchError();
  }
  if (
    kind === "job-trigger" &&
    existingMetadata?.state === "unknown" &&
    !sameKeyRecoveryActive(existingMetadata)
  ) {
    throw new PendingRecoveryUnavailableError();
  }
  const metadata: PendingOperationMetadata = {
    operationId,
    kind,
    resourceId,
    ...references,
    requestDigest,
    submittedAt: new Date().toISOString(),
    state: "submitted",
    ...(options.idempotencyKey === undefined ? {} : { idempotencyKey: options.idempotencyKey }),
    ...(options.recovery === undefined ? {} : { recovery: options.recovery }),
  };
  const key = pendingEntryKey(scopeKey, metadata.operationId);
  pendingMemory.set(key, {
    metadata,
    ...(options.retainRequest === true ? { request: value } : {}),
  });
  writePendingStorage(key, metadata);
  return metadata;
}

export async function rememberJobPending(
  scopeKey: string,
  resourceId: string,
  request: unknown,
  options: PendingRememberOptions = {},
): Promise<PendingOperationMetadata> {
  return rememberPending(
    scopeKey,
    "job-trigger",
    resourceId,
    request,
    {},
    {
      ...options,
      retainRequest: true,
    },
  );
}

export function updatePending(scopeKey: string, value: PendingOperationMetadata): void {
  const key = pendingEntryKey(scopeKey, value.operationId);
  const previous = pendingMemory.get(key);
  pendingMemory.set(key, {
    metadata: value,
    ...(previous?.request === undefined ? {} : { request: previous.request }),
  });
  writePendingStorage(key, value);
}

export function forgetPending(scopeKey: string, operationId: string): void {
  pendingMemory.delete(pendingEntryKey(scopeKey, operationId));
  removePendingStorage(pendingEntryKey(scopeKey, operationId));
}

export function pendingOperations(scopeKey: string): readonly PendingOperationMetadata[] {
  const result = readPendingStorage(scopeKey);
  for (const [key, value] of pendingMemory) {
    if (key.startsWith(`${PENDING_PREFIX}${scopeKey}.`))
      result.set(value.metadata.operationId, value.metadata);
  }
  return [...result.values()];
}

export function pendingRequest(scopeKey: string, operationId: string): unknown {
  return pendingMemory.get(pendingEntryKey(scopeKey, operationId))?.request;
}

export async function matchesPendingRequest(
  scopeKey: string,
  operationId: string,
  request: unknown,
): Promise<boolean> {
  const metadata = pendingOperations(scopeKey).find((entry) => entry.operationId === operationId);
  return metadata !== undefined && metadata.requestDigest === (await digestPendingRequest(request));
}

export function clearPendingOperations(scopeKey: string): void {
  for (const key of [...pendingMemory.keys()]) {
    if (key.startsWith(`${PENDING_PREFIX}${scopeKey}.`)) pendingMemory.delete(key);
  }
  clearPendingStorage(scopeKey);
}

export function isJobUnknownOutcome(value: unknown): value is JobUnknownOutcome {
  return jobUnknownOutcome(value) !== undefined;
}

export function jobUnknownOutcome(value: unknown): JobUnknownOutcome | undefined {
  for (const candidate of candidates(value)) {
    if (
      isRecord(candidate) &&
      candidate.outcome === "unknown" &&
      (candidate.code === "RELKIT_JOB_SUBMISSION_UNKNOWN" ||
        candidate.code === "RELKIT_JOB_CONTROL_UNKNOWN") &&
      typeof candidate.operationId === "string" &&
      isRecord(candidate.recovery) &&
      (candidate.recovery.action === "retry-with-same-key" ||
        candidate.recovery.action === "inspect-native" ||
        candidate.recovery.action === "unavailable")
    ) {
      return candidate as unknown as JobUnknownOutcome;
    }
  }
  return undefined;
}

export async function digestPendingRequest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value as never));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function jobIntentCount(scopeKey: string): number {
  return pendingOperations(scopeKey).filter((entry) => entry.kind === "job-trigger").length;
}

function sameKeyRecoveryActive(metadata: PendingOperationMetadata): boolean {
  const recovery = metadata.recovery;
  return (
    recovery?.action === "retry-with-same-key" &&
    (recovery.expiresAt === undefined || Date.parse(recovery.expiresAt) > Date.now())
  );
}
