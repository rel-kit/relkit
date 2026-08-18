import { canonicalJson, type JsonValue } from "@zsys/contracts";
import {
  createJobStorePaths,
  ensureJobRoot,
  makeMetadata,
  parseJobRecord,
  readJobMetadata,
  recoverJobRecords,
  writeJobMetadata,
  appendDurably,
  STORE_VERSION,
} from "./store-files.js";

export { STORE_VERSION } from "./store-files.js";

export type JobStoreBoundary = "record-fsynced" | "index-committed" | "checkpoint-committed";

export interface JobStoreOptions {
  readonly now?: () => number;
  /** Test-only failure seam; an error rejects append before acknowledgement. */
  readonly onBoundary?: (boundary: JobStoreBoundary) => void | Promise<void>;
  /** Optional semantic guard used by durable stores layered on this record format. */
  readonly validateData?: (data: JsonValue) => void;
}

export interface JobRecordInput {
  readonly instanceId: string;
  readonly kind: string;
  readonly data: JsonValue;
  readonly timestamp?: number;
}

export interface JobRecord {
  readonly version: typeof STORE_VERSION;
  readonly sequence: number;
  readonly instanceId: string;
  readonly kind: string;
  readonly timestamp: number;
  readonly data: JsonValue;
}

export interface JobIndexEntry {
  readonly sequence: number;
  readonly offset: number;
}

export interface JobStoreIndex {
  readonly version: typeof STORE_VERSION;
  readonly commit: number;
  readonly entries: Readonly<Record<string, JobIndexEntry>>;
}

export interface JobStoreCheckpoint {
  readonly version: typeof STORE_VERSION;
  readonly commit: number;
  readonly sequence: number;
  readonly offset: number;
  readonly recordCount: number;
}

export interface JobStoreSnapshot {
  readonly records: readonly JobRecord[];
  readonly index: JobStoreIndex;
  readonly checkpoint: JobStoreCheckpoint;
}

export interface JobStore {
  readonly root: string;
  readonly paths: Readonly<ReturnType<typeof createJobStorePaths>>;
  readonly append: (input: JobRecordInput) => Promise<JobRecord>;
  readonly snapshot: () => JobStoreSnapshot;
  readonly close: () => Promise<void>;
}

export class JobStoreStateError extends Error {
  readonly code = "ZSYS_JOB_STORE_STATE_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "JobStoreStateError";
  }
}

/** Opens and repairs the append log before exposing durable job operations. */
export async function createJobStore(
  requestedRoot: string,
  options: JobStoreOptions = {},
): Promise<JobStore> {
  const root = ensureJobRoot(requestedRoot);
  const paths = createJobStorePaths(root);
  const records = await recoverJobRecords(paths.records, root, options.validateData);
  const current = makeMetadata(records);
  const storedIndex = await readJobMetadata(paths.index, root, isIndex);
  const storedCheckpoint = await readJobMetadata(paths.checkpoint, root, isCheckpoint);
  if (
    storedIndex === undefined ||
    storedCheckpoint === undefined ||
    canonicalJson(storedIndex) !== canonicalJson(current.index) ||
    canonicalJson(storedCheckpoint) !== canonicalJson(current.checkpoint)
  ) {
    await writeJobMetadata(paths.index, paths.checkpoint, current.index, current.checkpoint);
  }

  let snapshot = makeSnapshot(records, current);
  // ponytail: one store-wide write lock; shard by state root if throughput matters.
  let tail = Promise.resolve();
  let closing = false;
  let closed = false;
  const append = (input: JobRecordInput): Promise<JobRecord> => {
    if (closing || closed) return Promise.reject(new JobStoreStateError("Job store is closed"));
    const result = tail.then(async () => {
      if (closed) throw new JobStoreStateError("Job store is closed");
      const record = makeRecord(input, snapshot.checkpoint.sequence + 1, options.now);
      await appendDurably(paths.records, `${canonicalJson(record)}\n`);
      await options.onBoundary?.("record-fsynced");
      const nextRecords = [...snapshot.records, record];
      const next = makeMetadata(nextRecords);
      snapshot = makeSnapshot(nextRecords, next);
      await writeJobMetadata(
        paths.index,
        paths.checkpoint,
        next.index,
        next.checkpoint,
        async () => options.onBoundary?.("index-committed"),
        async () => options.onBoundary?.("checkpoint-committed"),
      );
      return record;
    });
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  const close = async (): Promise<void> => {
    closing = true;
    await tail;
    closed = true;
  };
  return Object.freeze({ root, paths, append, snapshot: () => snapshot, close });
}

function makeRecord(
  input: JobRecordInput,
  sequence: number,
  now: (() => number) | undefined,
): JobRecord {
  const timestamp = input.timestamp ?? now?.() ?? Date.now();
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new JobStoreStateError("Job record timestamp is invalid");
  }
  return parseJobRecord({
    version: STORE_VERSION,
    sequence,
    instanceId: input.instanceId,
    kind: input.kind,
    timestamp,
    data: JSON.parse(canonicalJson(input.data)),
  });
}

function makeSnapshot(
  records: readonly JobRecord[],
  current: ReturnType<typeof makeMetadata>,
): JobStoreSnapshot {
  return Object.freeze({
    records: Object.freeze([...records]),
    index: current.index,
    checkpoint: current.checkpoint,
  });
}

function isIndex(value: unknown): value is JobStoreIndex {
  if (!isRecord(value) || value.version !== STORE_VERSION || !isCount(value.commit)) return false;
  if (!isRecord(value.entries)) return false;
  return Object.values(value.entries).every(
    (entry) =>
      isRecord(entry) && isCount(entry.sequence) && entry.sequence > 0 && isCount(entry.offset),
  );
}

function isCheckpoint(value: unknown): value is JobStoreCheckpoint {
  return (
    isRecord(value) &&
    value.version === STORE_VERSION &&
    isCount(value.commit) &&
    isCount(value.sequence) &&
    isCount(value.offset) &&
    isCount(value.recordCount)
  );
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
