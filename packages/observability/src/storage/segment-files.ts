import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
  type FileHandle,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { canonicalJson } from "@relkit/contracts";
import {
  OBSERVABILITY_MODEL_VERSION,
  type ObservabilityRecord,
  type ObservabilitySignal,
} from "../model.js";
import { admitObservabilityRecord } from "../record-admission.js";
import type { RedactionPolicy } from "../redaction.js";
import type { RedactedObservabilityRecord } from "../record-admission.js";

export const SEGMENT_DIRECTORIES = ["requests", "logs", "traces"] as const;
export type SegmentDirectory = (typeof SEGMENT_DIRECTORIES)[number];
const TRACE_SIGNALS = new Set<ObservabilitySignal>([
  "invocation",
  "job",
  "event",
  "resource",
  "tool",
  "agent",
  "span",
  "trace",
  "diagnostic",
  "generation",
]);

export interface SegmentFile {
  readonly path: string;
  readonly number: number;
  readonly active: boolean;
  readonly bytes: number;
  readonly records: number;
}

export async function ensureDirectory(path: string): Promise<void> {
  try {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("not a directory");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
    await mkdir(path, { recursive: true, mode: 0o700 });
  }
}

export async function ensureSegmentRoot(requestedRoot?: string): Promise<string> {
  if (requestedRoot !== undefined && requestedRoot.trim() === "") {
    throw new TypeError("Observability root must not be empty");
  }
  const root = resolve(requestedRoot ?? join(process.cwd(), ".relkit", "observability"));
  if (root === resolve("/")) throw new TypeError("Observability root is too broad");
  await ensureDirectory(root);
  return root;
}

export async function repairSegments(root: string, policy?: RedactionPolicy): Promise<void> {
  await Promise.all(
    SEGMENT_DIRECTORIES.map(async (directory) => {
      const signalRoot = join(root, directory);
      await ensureDirectory(signalRoot);
      for (const day of await readdir(signalRoot, { withFileTypes: true })) {
        if (!day.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(day.name)) continue;
        const dayRoot = join(signalRoot, day.name);
        for (const entry of await readdir(dayRoot, { withFileTypes: true })) {
          const match = /^(?:segment-)?(\d{1,12})(\.active)?\.ndjson$/.exec(entry.name);
          if (!entry.isFile() || match === null) continue;
          await repairFile(join(dayRoot, entry.name), directory, policy);
        }
      }
    }),
  );
}

export async function listSegments(directory: string): Promise<SegmentFile[]> {
  await ensureDirectory(directory);
  const files: SegmentFile[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const match = /^(?:segment-)?(\d{1,12})(\.active)?\.ndjson$/.exec(entry.name);
    if (!entry.isFile() || match === null) continue;
    const path = join(directory, entry.name);
    const contents = await readFile(path, "utf8");
    const info = await stat(path);
    files.push({
      path,
      number: Number(match[1]),
      active: match[2] !== undefined,
      bytes: info.size,
      records: contents.split("\n").filter((line) => line !== "").length,
    });
  }
  return files.sort((left, right) => left.number - right.number);
}

export async function appendLine(handle: FileHandle, line: string): Promise<void> {
  await handle.writeFile(line, "utf8");
}

export async function writeAtomic(path: string, value: string): Promise<void> {
  const temporary = join(dirname(path), `.relkit-repair-${randomUUID()}.tmp`);
  let handle: FileHandle | undefined;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(value, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, path);
    await syncDirectory(dirname(path));
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export function segmentDirectoryFor(signal: unknown): SegmentDirectory | undefined {
  if (signal === "request") return "requests";
  if (signal === "log") return "logs";
  return typeof signal === "string" && TRACE_SIGNALS.has(signal as ObservabilitySignal)
    ? "traces"
    : undefined;
}

async function repairFile(path: string, directory: SegmentDirectory, policy?: RedactionPolicy) {
  const contents = await readFile(path, "utf8");
  const safeLines: string[] = [];
  let malformed = false;
  let changed = !contents.endsWith("\n") && contents.length > 0;
  for (const line of contents.split("\n")) {
    if (line === "") continue;
    try {
      const value = JSON.parse(line) as unknown;
      const safe = isRecord(value) ? admitObservabilityRecord(value, policy) : undefined;
      if (!isStoredRecord(safe, directory)) throw new Error("invalid segment record");
      const canonical = canonicalJson(safe);
      safeLines.push(canonical);
      changed ||= canonical !== line;
    } catch {
      malformed = true;
      break;
    }
  }
  if (!malformed && !changed) return;
  if (malformed) await quarantine(path);
  await writeAtomic(path, safeLines.length === 0 ? "" : `${safeLines.join("\n")}\n`);
}

async function quarantine(path: string): Promise<void> {
  const root = join(dirname(dirname(dirname(path))), ".relkit-quarantine");
  await ensureDirectory(root);
  await writeFile(
    join(root, `${basename(path)}.${randomUUID()}.bad`),
    canonicalJson({ version: OBSERVABILITY_MODEL_VERSION, reason: "malformed-observability-tail" }),
    { mode: 0o600 },
  );
}

function isStoredRecord(
  value: unknown,
  directory: SegmentDirectory,
): value is RedactedObservabilityRecord {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { readonly version?: unknown }).version === OBSERVABILITY_MODEL_VERSION &&
    segmentDirectoryFor((value as { readonly signal?: unknown }).signal) === directory
  );
}

function isRecord(value: unknown): value is ObservabilityRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
