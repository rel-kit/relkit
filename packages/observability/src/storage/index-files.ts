import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import { admitObservabilityRecord } from "../record-admission.js";
import {
  OBSERVABILITY_MODEL_VERSION,
  type ObservabilityRecord,
  type ObservabilitySignal,
} from "../model.js";
import {
  SEGMENT_DIRECTORIES,
  type SegmentDirectory,
  segmentDirectoryFor,
} from "./segment-files.js";
import type { RedactionPolicy } from "../redaction.js";
import type { RedactedObservabilityRecord } from "../record-admission.js";

export interface SegmentScan {
  readonly path: string;
  readonly directory: SegmentDirectory;
  readonly active: boolean;
  readonly bytes: number;
}

export interface SegmentLine {
  readonly segment: SegmentScan;
  readonly record: RedactedObservabilityRecord;
  readonly offset: number;
  readonly bytes: number;
}

export interface SegmentScanVisitor {
  readonly segment: (value: SegmentScan) => void | Promise<void>;
  readonly line: (value: SegmentLine) => void | Promise<void>;
}

const SEGMENT_NAME = /^(?:segment-)?(\d{1,12})(\.active)?\.ndjson$/;

export async function scanObservabilitySegments(
  root: string,
  policy: RedactionPolicy | undefined,
  visitor: SegmentScanVisitor,
): Promise<void> {
  for (const directory of SEGMENT_DIRECTORIES) {
    const signalRoot = join(root, directory);
    const days = await sortedEntries(signalRoot);
    for (const day of days) {
      if (!day.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(day.name)) continue;
      const dayRoot = join(signalRoot, day.name);
      for (const file of await sortedEntries(dayRoot)) {
        const match = SEGMENT_NAME.exec(file.name);
        if (!file.isFile() || match === null) continue;
        const path = join(dayRoot, file.name);
        const segment: SegmentScan = {
          path,
          directory,
          active: match[2] !== undefined,
          bytes: (await stat(path)).size,
        };
        await visitor.segment(segment);
        await scanLines(segment, policy, visitor.line);
      }
    }
  }
}

export function relativeSegmentPath(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

async function scanLines(
  segment: SegmentScan,
  policy: RedactionPolicy | undefined,
  visit: SegmentScanVisitor["line"],
): Promise<void> {
  const contents = await readFile(segment.path, "utf8");
  let start = 0;
  let offset = 0;
  while (start < contents.length) {
    const newline = contents.indexOf("\n", start);
    const end = newline < 0 ? contents.length : newline;
    const raw = contents.slice(start, end);
    const bytes = Buffer.byteLength(raw, "utf8") + (newline < 0 ? 0 : 1);
    if (raw !== "") {
      try {
        const value = admitObservabilityRecord(JSON.parse(raw) as ObservabilityRecord, policy);
        if (isStoredRecord(value, segment.directory)) {
          await visit({ segment, record: value, offset, bytes });
        }
      } catch {
        break;
      }
    }
    offset += bytes;
    if (newline < 0) break;
    start = newline + 1;
  }
}

async function sortedEntries(path: string) {
  return (await readdir(path, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

function isStoredRecord(
  value: unknown,
  directory: SegmentDirectory,
): value is RedactedObservabilityRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as { readonly version?: unknown; readonly signal?: unknown };
  return (
    record.version === OBSERVABILITY_MODEL_VERSION &&
    segmentDirectoryFor(record.signal as ObservabilitySignal) === directory
  );
}

export function segmentName(path: string): string {
  return basename(path);
}
