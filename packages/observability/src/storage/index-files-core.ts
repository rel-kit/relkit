import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import { recordAdmissionCore } from "../record-admission-core.js";
import { redactionCore } from "../redaction-core.js";
import {
  OBSERVABILITY_MODEL_VERSION,
  type ObservabilityRecord,
  type ObservabilitySignal,
} from "../model.js";
import { SEGMENT_DIRECTORIES, segmentFilesCore } from "./segment-files-core.js";
import type { SegmentDirectory } from "./segment-files.types.js";
import type { RedactionPolicy } from "../redaction.js";
import type { RedactedObservabilityRecord } from "../record-admission.js";
import type { SegmentLine, SegmentScan, SegmentScanVisitor } from "./index-files.types.js";

const SEGMENT_NAME = /^(?:segment-)?(\d{1,12})(\.active)?\.ndjson$/;
const { segmentDirectoryFor } = segmentFilesCore;

async function scanObservabilitySegments(
  root: string,
  policy: RedactionPolicy | undefined,
  visitor: SegmentScanVisitor,
  signal?: AbortSignal,
): Promise<void> {
  for (const directory of SEGMENT_DIRECTORIES) {
    signal?.throwIfAborted();
    const signalRoot = join(root, directory);
    const days = await sortedEntries(signalRoot);
    for (const day of days) {
      signal?.throwIfAborted();
      if (!day.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(day.name)) continue;
      const dayRoot = join(signalRoot, day.name);
      for (const file of await sortedEntries(dayRoot)) {
        signal?.throwIfAborted();
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
        signal?.throwIfAborted();
        await scanLines(segment, policy, visitor.line, signal);
      }
    }
  }
}

function relativeSegmentPath(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

async function scanLines(
  segment: SegmentScan,
  policy: RedactionPolicy | undefined,
  visit: SegmentScanVisitor["line"],
  signal?: AbortSignal,
): Promise<void> {
  const contents = await readFile(segment.path, { encoding: "utf8", signal });
  let start = 0;
  let offset = 0;
  while (start < contents.length) {
    signal?.throwIfAborted();
    const newline = contents.indexOf("\n", start);
    const end = newline < 0 ? contents.length : newline;
    const raw = contents.slice(start, end);
    const bytes = Buffer.byteLength(raw, "utf8") + (newline < 0 ? 0 : 1);
    if (raw !== "") {
      let value: RedactedObservabilityRecord | undefined;
      try {
        value = recordAdmissionCore.admitRedacted(
          redactionCore.redactRecord(JSON.parse(raw) as ObservabilityRecord, policy),
        );
      } catch {
        break;
      }
      if (isStoredRecord(value, segment.directory)) {
        await visit({ segment, record: value, offset, bytes });
        signal?.throwIfAborted();
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

function segmentName(path: string): string {
  return basename(path);
}
export const indexFilesCore = { scanObservabilitySegments, relativeSegmentPath, segmentName };
