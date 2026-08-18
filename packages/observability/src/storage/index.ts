import { open } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJson } from "@zsys/contracts";
import type { ObservabilityRecord } from "../model.js";
import { admitObservabilityRecord } from "../record-admission.js";
import type { RedactedObservabilityRecord } from "../record-admission.js";
import {
  ensureDirectory,
  ensureSegmentRoot,
  repairSegments,
  writeAtomic,
} from "./segment-files.js";
import { scanObservabilitySegments } from "./index-files.js";
import {
  addLine,
  addRecord,
  addSegment,
  readPage,
  renameSegment,
  stats,
  trimEntries,
} from "./index-memory.js";
import { enforceRetention } from "./index-retention.js";
import {
  createIndexState,
  normalizeOptions,
  safeSegmentPath,
  type IndexConfig,
  type IndexState,
} from "./index-state.js";
import {
  OBSERVABILITY_INDEX_VERSION,
  type ObservabilityIndex,
  type ObservabilityIndexEntry,
  type ObservabilityIndexOptions,
  type ObservabilityIndexPage,
  type ObservabilityIndexPageOptions,
  type ObservabilityIndexStats,
} from "./index-types.js";

export * from "./index-types.js";

interface StoredIndex {
  readonly version: typeof OBSERVABILITY_INDEX_VERSION;
  readonly sequence: number;
  readonly entries: readonly ObservabilityIndexEntry[];
}

export async function createObservabilityIndex(
  options: ObservabilityIndexOptions = {},
): Promise<ObservabilityIndex> {
  const config = normalizeOptions(options);
  const root = await ensureSegmentRoot(options.root);
  await repairSegments(root, config.redaction);
  await ensureDirectory(join(root, "index"));
  const state = createIndexState();
  let closed = false;
  let tail = Promise.resolve();

  const append = (
    record: RedactedObservabilityRecord,
    path: string,
    offset: number,
    bytes: number,
  ) =>
    queue(async () => {
      assertOpen(closed);
      const entry = addRecord(state, root, record, safeSegmentPath(root, path), offset, bytes);
      trimEntries(state, root, config.maxEntries);
      await enforceRetention(root, state, config);
      await persist(root, state);
      return entry;
    });
  const finalize = (activePath: string, finalPath: string) =>
    queue(async () => {
      assertOpen(closed);
      renameSegment(
        state,
        root,
        safeSegmentPath(root, activePath),
        safeSegmentPath(root, finalPath),
      );
      await enforceRetention(root, state, config);
      await persist(root, state);
    });
  const rebuild = () =>
    queue(async () => {
      assertOpen(closed);
      reset(state);
      await scanObservabilitySegments(root, config.redaction, {
        segment: (segment) => {
          addSegment(state, segment);
        },
        line: (line) => addLine(state, root, line),
      });
      trimEntries(state, root, config.maxEntries);
      await enforceRetention(root, state, config);
      await persist(root, state);
    });
  const retain = () =>
    queue(async () => {
      assertOpen(closed);
      const result = await enforceRetention(root, state, config);
      await persist(root, state);
      return result;
    });
  const page = (value: ObservabilityIndexPageOptions = {}): ObservabilityIndexPage =>
    readPage(state, config, value);
  const read = (entry: ObservabilityIndexEntry) => readRecord(root, config, state, entry);
  const currentStats = (): ObservabilityIndexStats => stats(state);
  const flush = () => queue(() => persist(root, state));
  const close = () =>
    queue(async () => {
      if (closed) return;
      await persist(root, state);
      closed = true;
    });
  const index = Object.freeze({
    root,
    append,
    finalize,
    rebuild,
    retain,
    page,
    read,
    stats: currentStats,
    flush,
    close,
  });
  await rebuild();
  return index;

  function queue<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

async function readRecord(
  root: string,
  config: IndexConfig,
  state: IndexState,
  entry: ObservabilityIndexEntry,
): Promise<RedactedObservabilityRecord | undefined> {
  const current = state.records.get(entry.cursor);
  if (
    current === undefined ||
    current.segment !== entry.segment ||
    current.offset !== entry.offset ||
    current.bytes !== entry.bytes
  )
    return undefined;
  const handle = await open(safeSegmentPath(root, entry.segment), "r").catch(() => undefined);
  if (handle === undefined) return undefined;
  try {
    const buffer = Buffer.alloc(entry.bytes);
    const result = await handle.read(buffer, 0, entry.bytes, entry.offset);
    if (result.bytesRead !== entry.bytes) return undefined;
    const value = admitObservabilityRecord(
      JSON.parse(buffer.toString("utf8")) as ObservabilityRecord,
      config.redaction,
    );
    return value?.signal === entry.signal ? value : undefined;
  } catch {
    return undefined;
  } finally {
    await handle.close();
  }
}

async function persist(root: string, state: IndexState): Promise<void> {
  const stored: StoredIndex = {
    version: OBSERVABILITY_INDEX_VERSION,
    sequence: state.sequence,
    entries: [...state.records.values()],
  };
  await writeAtomic(join(root, "index", "index.json"), `${canonicalJson(stored)}\n`);
}

function reset(state: IndexState): void {
  state.records.clear();
  state.locations.clear();
  state.segments.clear();
  state.sequence = 0;
}

function assertOpen(closed: boolean): void {
  if (closed) throw new Error("Observability index is closed");
}
