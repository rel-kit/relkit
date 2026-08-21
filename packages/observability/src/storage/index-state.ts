import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  DEFAULT_INDEX_MAX_ENTRIES,
  DEFAULT_INDEX_PAGE_SIZE,
  DEFAULT_RETENTION_MAX_AGE_MS,
  DEFAULT_RETENTION_MAX_BYTES,
  type ObservabilityIndexEntry,
  type ObservabilityIndexOptions,
  type ObservabilityIndexPageOptions,
} from "./index-types.js";
import type { ObservabilityRecord } from "../model.js";
import { OBSERVABILITY_MODEL_VERSION, type LogLevel } from "../model.js";
import type { RedactionPolicy } from "../redaction.js";

export interface MutableSegment {
  path: string;
  active: boolean;
  bytes: number;
  oldest: number;
  newest: number;
  entries: Set<string>;
}

export interface IndexState {
  readonly records: Map<string, ObservabilityIndexEntry>;
  readonly locations: Map<string, string>;
  readonly segments: Map<string, MutableSegment>;
  sequence: number;
}

export interface IndexConfig {
  readonly maxAgeMs: number;
  readonly maxBytes: number;
  readonly maxEntries: number;
  readonly pageSize: number;
  readonly now: () => number;
  readonly redaction?: RedactionPolicy;
}

export function createIndexState(): IndexState {
  return { records: new Map(), locations: new Map(), segments: new Map(), sequence: 0 };
}

export function normalizeOptions(options: ObservabilityIndexOptions): IndexConfig {
  const retention = options.retention;
  const maxEntries = positive(
    options.maxEntries ?? retention?.maxEntries ?? DEFAULT_INDEX_MAX_ENTRIES,
  );
  const maxPageSize = positive(options.maxPageSize ?? DEFAULT_INDEX_PAGE_SIZE);
  return {
    maxAgeMs: positive(options.maxAgeMs ?? retention?.maxAgeMs ?? DEFAULT_RETENTION_MAX_AGE_MS),
    maxBytes: positive(options.maxBytes ?? retention?.maxBytes ?? DEFAULT_RETENTION_MAX_BYTES),
    maxEntries,
    pageSize: boundedLimit(options.pageSize, maxPageSize, Math.min(maxPageSize, maxEntries)),
    now: options.now ?? Date.now,
    ...(options.redaction === undefined ? {} : { redaction: options.redaction }),
  };
}

export function makeEntry(
  record: ObservabilityRecord,
  segment: string,
  offset: number,
  bytes: number,
  sequence: number,
): ObservabilityIndexEntry {
  const value = record as unknown as Record<string, unknown>;
  const severity = isLogLevel(value.level) ? value.level : undefined;
  return Object.freeze({
    cursor: String(sequence),
    signal: record.signal,
    segment,
    offset,
    bytes,
    timestamp: timestampFor(record),
    ...optionalText(value, "requestId"),
    ...optionalText(value, "traceId"),
    ...optionalText(value, "routeId"),
    ...optionalText(value, "functionId"),
    ...optionalText(value, "serviceId"),
    ...optionalText(value, "outcome"),
    ...optionalText(value, "generationId"),
    ...optionalText(value, "graphHash"),
    ...(severity === undefined ? {} : { severity }),
  });
}

export function assertEntry(record: ObservabilityRecord, offset: number, bytes: number): void {
  if (record.version !== OBSERVABILITY_MODEL_VERSION)
    throw new TypeError("Record version is invalid");
  if (!Number.isSafeInteger(offset) || offset < 0) throw new TypeError("Index offset is invalid");
  if (!Number.isSafeInteger(bytes) || bytes <= 0)
    throw new TypeError("Index byte length is invalid");
  timestampFor(record);
}

export function timestampFor(record: ObservabilityRecord): string {
  const value = record as unknown as Record<string, unknown>;
  for (const key of ["timestamp", "startedAt", "occurredAt", "acceptedAt"]) {
    const timestamp = value[key];
    if (typeof timestamp === "string" && Number.isFinite(Date.parse(timestamp))) return timestamp;
  }
  throw new TypeError("Observability record timestamp is required");
}

export function timestampMs(value: string): number | undefined {
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : undefined;
}

export function optionalText(value: Record<string, unknown>, key: string): Record<string, string> {
  const item = value[key];
  return typeof item === "string" && item !== "" ? { [key]: item } : {};
}

export function boundedLimit(value: number | undefined, fallback: number, maximum: number): number {
  const limit = value ?? fallback;
  if (!Number.isSafeInteger(limit) || limit <= 0) throw new TypeError("Index page size is invalid");
  return Math.min(limit, maximum);
}

export function parseCursor(value: string): number {
  const cursor = Number(value);
  if (!Number.isSafeInteger(cursor) || cursor < 0) throw new TypeError("Index cursor is invalid");
  return cursor;
}

export function safeSegmentPath(root: string, segment: string): string {
  const path = resolve(root, segment);
  const relation = relative(root, path);
  if (
    relation === "" ||
    relation === ".." ||
    relation.startsWith(`..${sep}`) ||
    isAbsolute(relation)
  ) {
    throw new TypeError("Index segment path escapes root");
  }
  return path;
}

export function matches(
  entry: ObservabilityIndexEntry,
  options: ObservabilityIndexPageOptions,
): boolean {
  return (
    (options.signal === undefined || entry.signal === options.signal) &&
    (options.routeId === undefined || entry.routeId === options.routeId) &&
    (options.functionId === undefined || entry.functionId === options.functionId) &&
    (options.outcome === undefined || entry.outcome === options.outcome) &&
    (options.requestId === undefined || entry.requestId === options.requestId) &&
    (options.traceId === undefined || entry.traceId === options.traceId) &&
    (options.serviceId === undefined || entry.serviceId === options.serviceId) &&
    (options.generationId === undefined || entry.generationId === options.generationId) &&
    (options.graphHash === undefined || entry.graphHash === options.graphHash) &&
    (options.severity === undefined || entry.severity === options.severity)
  );
}

function positive(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new TypeError("Index bound must be positive");
  return value;
}

function isLogLevel(value: unknown): value is LogLevel {
  return (
    value === "trace" ||
    value === "debug" ||
    value === "info" ||
    value === "warn" ||
    value === "error" ||
    value === "fatal"
  );
}
