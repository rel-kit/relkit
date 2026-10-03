import { Schema } from "effect";
import { CacheSnapshot } from "./persistence.schemas.js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { canonicalJson } from "@relkit/contracts";
import { ensureOwnedDirectory, quarantineStateFile } from "../state.js";
import { LocalCacheStateError } from "./types.js";
import type { LocalCacheStoreState } from "./store.js";

const SNAPSHOT_VERSION = 1;

/**
 * Resolves the durable snapshot inside the owned cache root.
 * @param root - Provider-owned root directory.
 * @returns The validated snapshot path.
 */
export function snapshotPath(root: string): string {
  return join(ensureOwnedDirectory(root), "snapshot.json");
}

/**
 * Restores a matching versioned snapshot and quarantines invalid data.
 * @param path - Filesystem path within provider ownership.
 * @param cacheId - Expected cache namespace.
 * @param schemaVersion - Expected cache schema namespace.
 * @returns Validated cache state or undefined when absent or quarantined.
 */
export function readCacheState(
  path: string,
  cacheId: string,
  schemaVersion: string | number,
): LocalCacheStoreState | undefined {
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new LocalCacheStateError("Cache snapshot cannot be read");
  }
  try {
    const state = Schema.decodeUnknownSync(CacheSnapshot)(JSON.parse(contents));
    assertState(state, cacheId, schemaVersion);
    return state;
  } catch (cause) {
    if (cause instanceof LocalCacheStateError) {
      quarantineStateFile(path, dirname(path));
      return undefined;
    }
    quarantineStateFile(path, dirname(path));
    return undefined;
  }
}

/**
 * Commits the complete cache snapshot by atomic file replacement.
 * @param path - Filesystem path within provider ownership.
 * @param state - Complete byte-LRU snapshot to persist or validate.
 * @param cacheId - Expected cache namespace.
 * @param schemaVersion - Expected cache schema namespace.
 * @returns A Promise resolving after the snapshot rename.
 */
export async function writeCacheState(
  path: string,
  state: LocalCacheStoreState,
  cacheId: string,
  schemaVersion: string | number,
): Promise<void> {
  const directory = ensureOwnedDirectory(dirname(path));
  const temporary = join(directory, `.relkit-tmp-${randomUUID()}.json`);
  const value = JSON.stringify({ version: SNAPSHOT_VERSION, cacheId, schemaVersion, ...state });
  try {
    await writeFile(temporary, value, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporary, path);
  } catch {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw new LocalCacheStateError("Cache snapshot could not be committed");
  }
}

/**
 * Validates cache namespace, canonical keys, byte totals and access counters.
 * @param state - Complete byte-LRU snapshot to persist or validate.
 * @param cacheId - Expected cache namespace.
 * @param schemaVersion - Expected cache schema namespace.
 * @returns Nothing when the complete snapshot is consistent.
 */
function assertState(
  state: unknown,
  cacheId: string,
  schemaVersion: string | number,
): asserts state is LocalCacheStoreState & {
  readonly cacheId: unknown;
  readonly schemaVersion: unknown;
  readonly version: unknown;
} {
  if (
    !isRecord(state) ||
    state.version !== SNAPSHOT_VERSION ||
    state.cacheId !== cacheId ||
    state.schemaVersion !== schemaVersion ||
    !isCount(state.sequence) ||
    !Array.isArray(state.entries) ||
    !isCount(state.bytes) ||
    !isCount(state.evictions) ||
    !isCount(state.hits) ||
    !isCount(state.misses) ||
    state.entries.some((entry) => !validEntry(entry))
  ) {
    throw new LocalCacheStateError("Cache snapshot metadata is malformed");
  }
  if (state.entries.some((entry) => !isCanonicalKey(entry.key))) {
    throw new LocalCacheStateError("Cache snapshot key metadata is malformed");
  }
  if (
    state.entries.some(
      (entry) =>
        new TextEncoder().encode(entry.key).byteLength +
          new TextEncoder().encode(canonicalJson(entry.value)).byteLength !==
        entry.bytes,
    )
  ) {
    throw new LocalCacheStateError("Cache snapshot entry size metadata is malformed");
  }
  const bytes = state.entries.reduce((total, entry) => total + entry.bytes, 0);
  const sequence = state.entries.reduce((maximum, entry) => Math.max(maximum, entry.lastUsed), 0);
  if (bytes !== state.bytes || sequence > state.sequence) {
    throw new LocalCacheStateError("Cache snapshot counters are malformed");
  }
}

/**
 * Checks persisted entry fields and its JSON-compatible payload.
 * @param value - Candidate value to validate, normalize or encode.
 * @returns Whether the value is a restorable cache entry.
 */
function validEntry(value: unknown): value is LocalCacheStoreState["entries"][number] {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    isCount(value.bytes) &&
    isCount(value.lastUsed) &&
    (value.expiresAt === undefined || isCount(value.expiresAt)) &&
    isCanonicalValue(value.value)
  );
}

/**
 * Checks that a persisted cache key uses canonical JSON encoding.
 * @param value - Candidate value to validate, normalize or encode.
 * @returns Whether parsing and canonical serialization preserve the key.
 */
function isCanonicalKey(value: string): boolean {
  try {
    return canonicalJson(JSON.parse(value)) === value;
  } catch {
    return false;
  }
}

/**
 * Checks that a value can use the cache canonical JSON representation.
 * @param value - Candidate value to validate, normalize or encode.
 * @returns Whether the value is supported cache data.
 */
function isCanonicalValue(value: unknown): boolean {
  try {
    canonicalJson(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks nonnegative safe integer counters and offsets.
 * @param value - Candidate value to validate, normalize or encode.
 * @returns Whether the value is a valid persisted count.
 */
function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Checks whether a value is a non-array object.
 * @param value - Candidate value to validate, normalize or encode.
 * @returns Whether the value has record shape.
 */
function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
