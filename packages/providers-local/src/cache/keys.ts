import { canonicalJson } from "@relkit/contracts";
import { LocalCacheKeyError, LocalCacheValueError } from "./types.js";

/**
 * Validates the namespace used to isolate canonical cache keys.
 * @param value - Candidate value to validate, normalize or encode.
 * @returns The normalized nonempty cache identifier.
 */
export function normalizeCacheId(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new LocalCacheKeyError();
  }
  return value.trim();
}

/**
 * Validates the cache schema namespace without changing its public representation.
 * @param value - Candidate value to validate, normalize or encode.
 * @returns A valid string or numeric schema version.
 */
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

/** Builds a deterministic namespace key without exposing the raw key to logs.
 * @param cacheId - Expected cache namespace.
 * @param schemaVersion - Expected cache schema namespace.
 * @param key - Application key to validate and resolve.
 * @returns The result described by the operation contract.
 */
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

/**
 * Serializes supported JSON values for byte accounting and cloning.
 * @param value - Candidate value to validate, normalize or encode.
 * @returns Canonical JSON or the existing cache value error.
 */
export function serializeLocalCacheValue(value: unknown): string {
  try {
    return canonicalJson(value);
  } catch {
    throw new LocalCacheValueError();
  }
}
