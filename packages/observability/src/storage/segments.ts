import { open, rename } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJson } from "@relkit/contracts";
import type { ObservabilityRecord } from "../model.js";
import { admitObservabilityRecord } from "../record-admission.js";
import type { RedactionPolicy } from "../redaction.js";
import type { RedactedObservabilityRecord } from "../record-admission.js";
import type { ObservabilityCollector } from "../collector.js";
import type { ObservabilityIndex } from "./index.js";
import {
  appendLine,
  ensureDirectory,
  ensureSegmentRoot,
  listSegments,
  repairSegments,
  segmentDirectoryFor,
  syncDirectory,
} from "./segment-files.js";
import type { SegmentDirectory } from "./segment-files.js";
import { dayFor, isRecordForSignal, positive, type SegmentState } from "./segment-store-utils.js";

export const OBSERVABILITY_SEGMENT_FAILURE = "observability.during-segment-rotation" as const;
export const DEFAULT_SEGMENT_MAX_BYTES = 1024 * 1024;
export const DEFAULT_SEGMENT_MAX_RECORDS = 1024;
export type ObservabilitySegmentFailure = typeof OBSERVABILITY_SEGMENT_FAILURE;

export interface SegmentFailureControls {
  readonly check: (point: ObservabilitySegmentFailure) => void | Promise<void>;
}

export interface ObservabilitySegmentOptions {
  readonly root?: string;
  readonly maxSegmentBytes?: number;
  readonly maxRecordsPerSegment?: number;
  readonly maxBytes?: number;
  readonly maxRecords?: number;
  readonly redaction?: RedactionPolicy;
  readonly collector?: Pick<ObservabilityCollector, "collect">;
  readonly index?: Pick<ObservabilityIndex, "append" | "finalize">;
  readonly failures?: SegmentFailureControls;
  readonly onFailure?: (point: ObservabilitySegmentFailure) => void | Promise<void>;
}

export interface ObservabilitySegmentStore {
  readonly root: string;
  readonly append: (
    record: ObservabilityRecord,
  ) => Promise<RedactedObservabilityRecord | undefined>;
  readonly flush: () => Promise<void>;
  readonly shutdown: () => Promise<void>;
  readonly close: () => Promise<void>;
}

export async function createObservabilitySegmentStore(
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
    await tail;
    await flushStates();
    closed = true;
  };

  async function appendRecord(
    record: ObservabilityRecord,
  ): Promise<RedactedObservabilityRecord | undefined> {
    const directory = segmentDirectoryFor(record.signal);
    if (directory === undefined) return undefined;
    const safe =
      options.collector === undefined
        ? admitObservabilityRecord(record, options.redaction)
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
