import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { canonicalJson } from "@zsys/contracts";
import { ensureOwnedDirectory, quarantineStateFile } from "../state.js";
import { LocalCacheStateError } from "./types.js";
import type { LocalCacheStoreState } from "./store.js";

const SNAPSHOT_VERSION = 1;

export function snapshotPath(root: string): string {
  return join(ensureOwnedDirectory(root), "snapshot.json");
}

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
    const state = JSON.parse(contents) as LocalCacheStoreState & {
      readonly cacheId?: unknown;
      readonly schemaVersion?: unknown;
      readonly version?: unknown;
    };
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

export async function writeCacheState(
  path: string,
  state: LocalCacheStoreState,
  cacheId: string,
  schemaVersion: string | number,
): Promise<void> {
  const directory = ensureOwnedDirectory(dirname(path));
  const temporary = join(directory, `.zsys-tmp-${randomUUID()}.json`);
  const value = JSON.stringify({ version: SNAPSHOT_VERSION, cacheId, schemaVersion, ...state });
  try {
    await writeFile(temporary, value, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporary, path);
  } catch {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw new LocalCacheStateError("Cache snapshot could not be committed");
  }
}

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

function isCanonicalKey(value: string): boolean {
  try {
    return canonicalJson(JSON.parse(value)) === value;
  } catch {
    return false;
  }
}

function isCanonicalValue(value: unknown): boolean {
  try {
    canonicalJson(value);
    return true;
  } catch {
    return false;
  }
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
