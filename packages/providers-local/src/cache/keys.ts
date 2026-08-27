import { canonicalJson } from "@relkit/contracts";
import { LocalCacheKeyError, LocalCacheValueError } from "./types.js";

export function normalizeCacheId(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new LocalCacheKeyError();
  }
  return value.trim();
}

export function normalizeSchemaVersion(value: unknown): string | number {
  if (
    (typeof value !== "string" && typeof value !== "number") ||
    (typeof value === "string" && value.trim() === "") ||
    (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0))
  ) {
    throw new LocalCacheKeyError();
  }
  return typeof value === "string" ? value.trim() : value;
}

/** Builds a deterministic namespace key without exposing the raw key to logs. */
export function createLocalCacheKey(
  cacheId: string,
  schemaVersion: string | number,
  key: unknown,
): string {
  try {
    return canonicalJson({ cacheId, key, schemaVersion });
  } catch {
    throw new LocalCacheKeyError();
  }
}

export function serializeLocalCacheValue(value: unknown): string {
  try {
    return canonicalJson(value);
  } catch {
    throw new LocalCacheValueError();
  }
}
