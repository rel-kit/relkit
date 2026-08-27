import { randomUUID } from "node:crypto";
import { open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { canonicalJson, deepFreeze, type JsonValue } from "@relkit/contracts";
import { ensureOwnedDirectory, quarantineStateFile } from "../state.js";
import type { JobIndexEntry, JobRecord, JobStoreCheckpoint, JobStoreIndex } from "./store.js";
export const STORE_VERSION = 1 as const;

export interface JobStorePaths {
  readonly records: string;
  readonly index: string;
  readonly checkpoint: string;
}
export function ensureJobRoot(requestedRoot: string): string {
  if (requestedRoot.trim() === "") throw new Error("Job state root is empty");
  const root = ensureOwnedDirectory(requestedRoot);
  if (root === resolve("/")) throw new Error("Job state root is too broad");
  return root;
}
export function createJobStorePaths(root: string): JobStorePaths {
  return Object.freeze({
    records: join(root, "records.ndjson"),
    index: join(root, "index.json"),
    checkpoint: join(root, "checkpoint.json"),
  });
}
export function makeMetadata(records: readonly JobRecord[]): {
  readonly index: JobStoreIndex;
  readonly checkpoint: JobStoreCheckpoint;
} {
  const entries: Record<string, JobIndexEntry> = {};
  let offset = 0;
  let sequence = 0;
  for (const record of records) {
    entries[record.instanceId] = { sequence: record.sequence, offset };
    offset += Buffer.byteLength(`${canonicalJson(record)}\n`);
    sequence = Math.max(sequence, record.sequence);
  }
  const commit = sequence;
  return {
    index: Object.freeze({ version: STORE_VERSION, commit, entries: Object.freeze(entries) }),
    checkpoint: Object.freeze({
      version: STORE_VERSION,
      commit,
      sequence,
      offset,
      recordCount: records.length,
    }),
  };
}
export async function recoverJobRecords(
  path: string,
  root: string,
  validateData?: (data: JsonValue) => void,
): Promise<readonly JobRecord[]> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
      await writeDurably(path, "");
      return [];
    }
    throw new Error("Job records cannot be read");
  }
  const records: JobRecord[] = [];
  const sequences = new Set<number>();
  let malformed = false;
  for (const line of contents.split("\n")) {
    if (line === "") continue;
    try {
      const record = parseJobRecord(JSON.parse(line));
      validateData?.(record.data);
      if (sequences.has(record.sequence)) throw new Error("duplicate sequence");
      sequences.add(record.sequence);
      records.push(record);
    } catch {
      malformed = true;
    }
  }
  if (!malformed) return records;
  await quarantineStateFile(path, root);
  await syncDirectory(root);
  await writeDurably(path, records.map((record) => `${canonicalJson(record)}\n`).join(""));
  return records;
}

export function parseJobRecord(value: unknown): JobRecord {
  if (!isRecord(value) || value.version !== STORE_VERSION) {
    throw new Error("Job record is malformed");
  }
  if (
    !isPositiveCount(value.sequence) ||
    typeof value.instanceId !== "string" ||
    value.instanceId.trim() === "" ||
    typeof value.kind !== "string" ||
    value.kind.trim() === "" ||
    !isCount(value.timestamp)
  ) {
    throw new Error("Job record is malformed");
  }
  const data = deepFreeze(JSON.parse(canonicalJson(value.data)) as JsonValue);
  return Object.freeze({
    version: STORE_VERSION,
    sequence: value.sequence,
    instanceId: value.instanceId,
    kind: value.kind,
    timestamp: value.timestamp,
    data,
  });
}

export async function readJobMetadata<T>(
  path: string,
  root: string,
  guard: (value: unknown) => value is T,
): Promise<T | undefined> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error("Job metadata cannot be read");
  }
  try {
    const value = JSON.parse(contents);
    if (!guard(value)) throw new Error();
    return value;
  } catch {
    await quarantineStateFile(path, root);
    await syncDirectory(root);
    return undefined;
  }
}

export async function writeJobMetadata(
  indexPath: string,
  checkpointPath: string,
  index: JobStoreIndex,
  checkpoint: JobStoreCheckpoint,
  afterIndex?: () => void | Promise<void>,
  afterCheckpoint?: () => void | Promise<void>,
): Promise<void> {
  await writeDurably(indexPath, canonicalJson(index));
  await afterIndex?.();
  await writeDurably(checkpointPath, canonicalJson(checkpoint));
  await afterCheckpoint?.();
}

export async function appendDurably(path: string, value: string): Promise<void> {
  const handle = await open(path, "a", 0o600);
  try {
    await handle.writeFile(value, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeDurably(path: string, value: string): Promise<void> {
  const directory = ensureOwnedDirectory(dirname(path));
  const temporary = join(directory, `.relkit-tmp-${randomUUID()}`);
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(value, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, path);
    await syncDirectory(directory);
  } catch (cause) {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
    throw new Error(
      `Job state file could not be committed: ${cause instanceof Error ? cause.message : "unknown error"}`,
    );
  }
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveCount(value: unknown): value is number {
  return isCount(value) && value > 0;
}
