import { canonicalJson, type PendingOperationMetadata } from "@relkit/contracts";
import { createOperationId } from "@relkit/realtime/operation-id";
import type { RelkitKeyScope } from "./keys.js";

const PREFIX = "relkit.pending.";

export function pendingScopeKey(scope: RelkitKeyScope): string {
  return JSON.stringify(scope);
}

export async function rememberPending(
  scopeKey: string,
  kind: PendingOperationMetadata["kind"],
  resourceId: string,
  value: unknown,
  references: Pick<PendingOperationMetadata, "threadId" | "runId"> = {},
): Promise<PendingOperationMetadata> {
  const metadata: PendingOperationMetadata = {
    operationId: createOperationId(),
    kind,
    resourceId,
    ...references,
    requestDigest: await digest(value),
    submittedAt: new Date().toISOString(),
    state: "submitted",
  };
  storage()?.setItem(`${PREFIX}${scopeKey}.${metadata.operationId}`, JSON.stringify(metadata));
  return metadata;
}

export function updatePending(scopeKey: string, value: PendingOperationMetadata): void {
  storage()?.setItem(`${PREFIX}${scopeKey}.${value.operationId}`, JSON.stringify(value));
}

export function forgetPending(scopeKey: string, operationId: string): void {
  storage()?.removeItem(`${PREFIX}${scopeKey}.${operationId}`);
}

export function pendingOperations(scopeKey: string): readonly PendingOperationMetadata[] {
  const target = storage();
  if (target === undefined) return [];
  const result: PendingOperationMetadata[] = [];
  for (const key of Object.keys(target)) {
    if (!key.startsWith(`${PREFIX}${scopeKey}.`)) continue;
    try {
      result.push(JSON.parse(target.getItem(key) ?? "null") as PendingOperationMetadata);
    } catch {}
  }
  return result;
}

export function clearPendingOperations(scopeKey: string): void {
  const target = storage();
  if (target === undefined) return;
  for (const key of Object.keys(target)) {
    if (key.startsWith(`${PREFIX}${scopeKey}.`)) target.removeItem(key);
  }
}

function storage(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value as never));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
