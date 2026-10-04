import type { PendingOperationMetadata } from "@relkit/contracts";
import { isPersistedPendingMetadata } from "./pending.schemas.js";

export const PENDING_PREFIX = "relkit.pending.";
export const pendingMemory = new Map<
  string,
  { readonly metadata: PendingOperationMetadata; readonly request?: unknown }
>();

/**
 * Constructs the existing persistence key for one scoped receipt.
 * @param scopeKey - Complete serialized identity scope.
 * @param operationId - Existing receipt identity.
 * @returns The canonical scoped storage key.
 */
export function pendingEntryKey(scopeKey: string, operationId: string): string {
  return `${PENDING_PREFIX}${scopeKey}.${operationId}`;
}

/**
 * Persists metadata best-effort without persisting transmitted requests.
 * @param key - Existing canonical identity key.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns Nothing; the existing owned state or publication is updated.
 */
export function writePendingStorage(key: string, value: PendingOperationMetadata): void {
  try {
    sessionStorageValue()?.setItem(key, JSON.stringify(value));
  } catch {}
}

/**
 * Removes persisted receipt metadata without surfacing unavailable browser storage.
 * @param key - Existing canonical identity key.
 * @returns Nothing; the existing owned state or publication is updated.
 */
export function removePendingStorage(key: string): void {
  try {
    sessionStorageValue()?.removeItem(key);
  } catch {}
}

/**
 * Recovers selectively validated metadata while isolating malformed entries.
 * @param scopeKey - Complete serialized identity scope.
 * @returns Recovered operation metadata indexed by receipt identity.
 */
export function readPendingStorage(scopeKey: string): Map<string, PendingOperationMetadata> {
  const result = new Map<string, PendingOperationMetadata>();
  const target = sessionStorageValue();
  if (target === undefined) return result;
  try {
    for (const key of Object.keys(target)) {
      if (!key.startsWith(`${PENDING_PREFIX}${scopeKey}.`)) continue;
      try {
        const value = JSON.parse(target.getItem(key) ?? "null") as PendingOperationMetadata;
        if (isPersistedPendingMetadata(value)) {
          result.set(value.operationId, value);
        }
      } catch {}
    }
  } catch {}
  return result;
}

/**
 * Retires all persisted receipt metadata in one complete identity scope.
 * @param scopeKey - Complete serialized identity scope.
 * @returns Nothing; the existing owned state or publication is updated.
 */
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

/**
 * Reads browser session storage without throwing when access is unavailable.
 * @returns Accessible session storage, or undefined when unavailable.
 */
function sessionStorageValue(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}
