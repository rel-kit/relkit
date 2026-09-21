import type { PendingOperationMetadata } from "@relkit/contracts";

export const PENDING_PREFIX = "relkit.pending.";
export const pendingMemory = new Map<
  string,
  { readonly metadata: PendingOperationMetadata; readonly request?: unknown }
>();

export function pendingEntryKey(scopeKey: string, operationId: string): string {
  return `${PENDING_PREFIX}${scopeKey}.${operationId}`;
}

export function writePendingStorage(key: string, value: PendingOperationMetadata): void {
  try {
    sessionStorageValue()?.setItem(key, JSON.stringify(value));
  } catch {}
}

export function removePendingStorage(key: string): void {
  try {
    sessionStorageValue()?.removeItem(key);
  } catch {}
}

export function readPendingStorage(scopeKey: string): Map<string, PendingOperationMetadata> {
  const result = new Map<string, PendingOperationMetadata>();
  const target = sessionStorageValue();
  if (target === undefined) return result;
  try {
    for (const key of Object.keys(target)) {
      if (!key.startsWith(`${PENDING_PREFIX}${scopeKey}.`)) continue;
      try {
        const value = JSON.parse(target.getItem(key) ?? "null") as PendingOperationMetadata;
        if (value !== null && typeof value === "object" && typeof value.operationId === "string") {
          result.set(value.operationId, value);
        }
      } catch {}
    }
  } catch {}
  return result;
}

export function clearPendingStorage(scopeKey: string): void {
  const target = sessionStorageValue();
  if (target === undefined) return;
  try {
    for (const key of Object.keys(target)) {
      if (key.startsWith(`${PENDING_PREFIX}${scopeKey}.`)) {
        try {
          target.removeItem(key);
        } catch {}
      }
    }
  } catch {}
}

function sessionStorageValue(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}
