import { appendDurably, writeDurably, syncDirectory } from "./durable-file.js";
import type { JobStorePaths } from "./store-files.types.js";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { canonicalJson, deepFreeze, type JsonValue } from "@relkit/contracts";
import { ensureOwnedDirectory, quarantineStateFile } from "../state.js";
import type { JobIndexEntry, JobRecord, JobStoreCheckpoint, JobStoreIndex } from "./store.js";
import { Effect, Schema } from "effect";
import { runLocal } from "../local-effect.js";
import { JobRecordSchema } from "./store.schemas.js";

export { appendDurably } from "./durable-file.js";
export type { JobStorePaths } from "./store-files.types.js";
export const STORE_VERSION = 1 as const;

/** Validates the journal root and rejects an empty or filesystem-wide ownership boundary.
 * @param requestedRoot - Requested owned state directory.
 * @returns The resolved owned journal root.
 */
export function ensureJobRoot(requestedRoot: string): string {
  if (requestedRoot.trim() === "") throw new Error("Job state root is empty");
  const root = ensureOwnedDirectory(requestedRoot);
  if (root === resolve("/")) throw new Error("Job state root is too broad");
  return root;
}
/** Builds the stable records, index and checkpoint paths beneath the owned root.
 * @param root - Owned state directory.
 * @returns Immutable owned journal paths.
 */
export function createJobStorePaths(root: string): JobStorePaths {
  return Object.freeze({
    records: join(root, "records.ndjson"),
    index: join(root, "index.json"),
    checkpoint: join(root, "checkpoint.json"),
  });
}
/** Rebuilds index offsets and checkpoint counters from canonical durable records.
 * @param records - Ordered retained durable records.
 * @returns The rebuilt index and checkpoint.
 */
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
/** Replays valid NDJSON records, quarantines corruption, and durably rewrites the recoverable journal.
 * @param path - Owned filesystem path.
 * @param root - Owned state directory.
 * @param validateData - Domain decoder invoked during durable record recovery.
 * @returns The recoverable records in durable order.
 */
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
  await runLocal(
    Effect.logWarning("Recovered local journal after quarantining malformed records").pipe(
      Effect.annotateLogs({
        domain: "local",
        operation: "JobStore.recover",
        recoveredRecords: records.length,
      }),
    ),
  );
  return records;
}

/** Validates a format-v1 journal envelope and freezes its canonical JSON payload.
 * @param value - Value to validate, normalize or project.
 * @returns The validated immutable journal record.
 */
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
  const data = deepFreeze(
    Schema.decodeUnknownSync(Schema.Json)(JSON.parse(canonicalJson(value.data))),
  );
  return Object.freeze(
    Schema.decodeUnknownSync(JobRecordSchema)({
      version: STORE_VERSION,
      sequence: value.sequence,
      instanceId: value.instanceId,
      kind: value.kind,
      timestamp: value.timestamp,
      data,
    }),
  );
}

/** Reads validated metadata or quarantines malformed content before recovery.
 * @param path - Owned filesystem path.
 * @param root - Owned state directory.
 * @param guard - Runtime predicate validating the persisted value.
 * @returns Validated metadata, or undefined after absence or quarantine.
 * @typeParam T - Shape preserved by this operation.
 */
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
    await runLocal(
      Effect.logWarning("Quarantined malformed local journal metadata for reconstruction").pipe(
        Effect.annotateLogs({ domain: "local", operation: "JobStore.metadataRecovery" }),
      ),
    );
    return undefined;
  }
}

/** Commits the index before the checkpoint and invokes each durable-boundary hook in order.
 * @param indexPath - Owned index file path.
 * @param checkpointPath - Owned checkpoint file path.
 * @param index - Derived durable record index.
 * @param checkpoint - Committed replay position.
 * @param afterIndex - Hook invoked after the index is committed.
 * @param afterCheckpoint - Hook invoked after the checkpoint is committed.
 * @returns A Promise completing after ordered index and checkpoint commit.
 */
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

/** Checks for a non-null, non-array object before inspecting unknown fields.
 * @param value - Value to validate, normalize or project.
 * @returns Whether the value is a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Checks that a value is a nonnegative safe integer.
 * @param value - Value to validate, normalize or project.
 * @returns Whether the value is a nonnegative safe integer.
 */
function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Checks that a value is a positive safe integer.
 * @param value - Value to validate, normalize or project.
 * @returns Whether the value is a positive safe integer.
 */
function isPositiveCount(value: unknown): value is number {
  return isCount(value) && value > 0;
}
