import { open, rename } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJson } from "@relkit/contracts";
import type { ObservabilityRecord } from "../model.js";
import { recordAdmissionCore } from "../record-admission-core.js";
import type { RedactedObservabilityRecord } from "../record-admission.js";
import { redactionCore } from "../redaction-core.js";
import { releaseResources } from "../resource-release.js";
import type { ObservabilitySegmentOptions, ObservabilitySegmentStore } from "./segments.types.js";
import { segmentFilesCore } from "./segment-files-core.js";
import type { SegmentDirectory } from "./segment-files.types.js";
import { segmentStoreUtilsCore } from "./segment-store-utils-core.js";
import type { SegmentState } from "./segment-store-utils.types.js";
const { dayFor, isRecordForSignal, positive } = segmentStoreUtilsCore;
const {
  appendLine,
  ensureDirectory,
  ensureSegmentRoot,
  listSegments,
  repairSegments,
  segmentDirectoryFor,
  syncDirectory,
} = segmentFilesCore;
export const OBSERVABILITY_SEGMENT_FAILURE = "observability.during-segment-rotation" as const;
export const DEFAULT_SEGMENT_MAX_BYTES = 1024 * 1024;
export const DEFAULT_SEGMENT_MAX_RECORDS = 1024;
/**
 * Opens an indexed, bounded NDJSON segment store.
 *
 * @param options - Segment sizes, retention, redaction, and index callbacks.
 * @returns A live store whose close releases active file handles.
 * @throws {Error} If acquisition, repair, or storage IO fails.
 * @example
 * const store = await createObservabilitySegmentStore({ root });
 * await store.close();
 */
async function createObservabilitySegmentStore(
  options: ObservabilitySegmentOptions = {},
): Promise<ObservabilitySegmentStore> {
  const maxBytes = positive(
    options.maxSegmentBytes ?? options.maxBytes ?? DEFAULT_SEGMENT_MAX_BYTES,
  );
  const maxRecords = positive(
    options.maxRecordsPerSegment ?? options.maxRecords ?? DEFAULT_SEGMENT_MAX_RECORDS,
  );
  const root = await ensureSegmentRoot(options.root);
  await repairSegments(root, options.redaction);
  const states = new Map<string, SegmentState>();
  let tail = Promise.resolve();
  let closing = false;
  let closed = false;
  const append = (
    record: ObservabilityRecord,
  ): Promise<RedactedObservabilityRecord | undefined> => {
    if (closing || closed)
      return Promise.reject(new Error("Observability segment store is closed"));
    const result = tail.then(() => appendRecord(record));
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  const flush = async (): Promise<void> => {
    await tail;
    await Promise.all([...states.values()].map((state) => state.handle.sync()));
  };
  const shutdown = async (): Promise<void> => {
    if (closed) return;
    closing = true;
    let failure: { readonly error: unknown } | undefined;
    try {
      await tail;
      await flushStates();
    } catch (error) {
      failure = { error };
    } finally {
      try {
        await releaseResources([...states.values()].map((state) => () => state.handle.close()));
      } catch (error) {
        failure ??= { error };
      }
      states.clear();
      closed = true;
    }
    if (failure !== undefined) throw failure.error;
  };
  async function appendRecord(
    record: ObservabilityRecord,
  ): Promise<RedactedObservabilityRecord | undefined> {
    const directory = segmentDirectoryFor(record.signal);
    if (directory === undefined) return undefined;
    const safe =
      options.collector === undefined
        ? recordAdmissionCore.admitRedacted(redactionCore.redactRecord(record, options.redaction))
        : options.collector.collect(record);
    if (!isRecordForSignal(safe, record.signal)) return undefined;
    const day = dayFor(safe);
    const key = `${directory}/${day}`;
    let state = states.get(key);
    const line = `${canonicalJson(safe)}\n`;
    const bytes = Buffer.byteLength(line);
    if (state !== undefined && (state.records >= maxRecords || state.bytes + bytes > maxBytes)) {
      await rotate(state);
      states.delete(key);
      state = undefined;
    }
    state ??= await openState(directory, day, key);
    await appendLine(state.handle, line);
    await options.index?.append(safe, state.activePath, state.bytes, bytes);
    state.bytes += bytes;
    state.records += 1;
    return safe;
  }
  async function openState(directory: SegmentDirectory, day: string, key: string) {
    const dayRoot = join(root, directory, day);
    await ensureDirectory(dayRoot);
    const files = await listSegments(dayRoot);
    const active = files.filter((file) => file.active).at(-1);
    const number = active?.number ?? (files.at(-1)?.number ?? 0) + 1;
    const name = `segment-${String(number).padStart(6, "0")}.active.ndjson`;
    const activePath = active?.path ?? join(dayRoot, name);
    const handle = await open(activePath, "a+", 0o600);
    const state: SegmentState = {
      directory: dayRoot,
      activePath,
      handle,
      bytes: active?.bytes ?? 0,
      records: active?.records ?? 0,
    };
    states.set(key, state);
    return state;
  }
  async function rotate(state: SegmentState): Promise<void> {
    await state.handle.sync();
    await options.failures?.check(OBSERVABILITY_SEGMENT_FAILURE);
    await options.onFailure?.(OBSERVABILITY_SEGMENT_FAILURE);
    await state.handle.close();
    const finalPath = state.activePath.replace(".active.ndjson", ".ndjson");
    await rename(state.activePath, finalPath);
    await options.index?.finalize(state.activePath, finalPath);
    await syncDirectory(state.directory);
  }
  async function flushStates(): Promise<void> {
    for (const state of states.values()) {
      await state.handle.sync();
      await state.handle.close();
      const finalPath = state.activePath.replace(".active.ndjson", ".ndjson");
      await rename(state.activePath, finalPath);
      await options.index?.finalize(state.activePath, finalPath);
      await syncDirectory(state.directory);
    }
    states.clear();
  }
  return Object.freeze({ root, append, flush, shutdown, close: shutdown });
}
export const segmentsCore = { createObservabilitySegmentStore };
