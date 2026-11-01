/** Pure projections behind the Overview dashboard: request volume, generation history, health. */
import type { InspectorObject } from "./api-types";

/** Same words as the shared StatusBadge tones, kept local so this module stays UI-free. */
export type OverviewTone = "success" | "warning" | "danger" | "info" | "neutral" | "live";

export interface RequestSummary {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly status?: number;
  readonly outcome: string;
  readonly durationMs?: number;
  readonly at?: string;
  readonly tone: OverviewTone;
  readonly statusLabel: string;
  readonly href?: string;
}

/**
 * A request failed when the server answered 5xx. Without a status, a failing runtime outcome
 * counts; 4xx answers (validation, auth, not found) are client errors, not failures.
 */
export function isFailedRequest(item: InspectorObject): boolean {
  const status = integer(item.status);
  if (status !== undefined) return status >= 500;
  return /(error|fail|defect|timeout|abort|reject)/i.test(text(item.outcome) ?? "");
}

export function requestSummary(item: InspectorObject): RequestSummary {
  const requestId = text(item.requestId);
  const status = integer(item.status);
  const outcome = text(item.outcome) ?? "unknown";
  const durationMs = finite(item.durationMs);
  const at = timestamp(item.completedAt) ?? timestamp(item.startedAt);
  const pending = text(item.phase) === "started" && item.completedAt === undefined;
  const tone: OverviewTone = pending
    ? "live"
    : isFailedRequest(item)
      ? "danger"
      : status !== undefined && status >= 400
        ? "warning"
        : "success";
  return {
    id: requestId ?? text(item.cursor) ?? `${text(item.method) ?? "HTTP"}-${at ?? "unknown"}`,
    method: text(item.method) ?? "HTTP",
    path: pathOf(item),
    outcome,
    tone,
    statusLabel: pending
      ? "In progress"
      : status === undefined
        ? outcome
        : `HTTP ${status} ${outcome}`,
    ...(status === undefined ? {} : { status }),
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(at === undefined ? {} : { at }),
    ...(requestId === undefined ? {} : { href: `/requests/${encodeURIComponent(requestId)}` }),
  };
}

export interface RequestVolume {
  /** Requests in the sample. */
  readonly total: number;
  readonly failed: number;
  /** Failed share of the sample in 0..1; undefined for an empty sample. */
  readonly errorRate?: number;
  /** Requests per minute, oldest first, ending at the newest request's minute. */
  readonly perMinute: readonly number[];
  /** Start of the oldest request in the sample. */
  readonly since?: string;
}

/**
 * Summarises a newest-first request sample. Buckets end at the newest request rather than "now"
 * so a quiet app still shows the shape of its last burst instead of a flat line.
 */
export function requestVolume(items: readonly InspectorObject[], minutes = 30): RequestVolume {
  const times = items.flatMap((item) => {
    const at = timestamp(item.completedAt) ?? timestamp(item.startedAt);
    return at === undefined ? [] : [Date.parse(at)];
  });
  const failed = items.filter(isFailedRequest).length;
  const base = {
    total: items.length,
    failed,
    ...(items.length === 0 ? {} : { errorRate: failed / items.length }),
  };
  if (times.length === 0) return { ...base, perMinute: [] };
  const minute = 60_000;
  const end = Math.floor(Math.max(...times) / minute);
  const buckets = Array.from({ length: Math.max(1, minutes) }, () => 0);
  for (const time of times) {
    const offset = end - Math.floor(time / minute);
    if (offset >= 0 && offset < buckets.length) buckets[buckets.length - 1 - offset]! += 1;
  }
  return { ...base, perMinute: buckets, since: new Date(Math.min(...times)).toISOString() };
}

/** "0%", "0.4%", "12%" — one decimal only below 10%. */
export function formatRate(rate: number | undefined): string {
  if (rate === undefined || !Number.isFinite(rate)) return "—";
  const percent = Math.max(0, Math.min(1, rate)) * 100;
  if (percent === 0) return "0%";
  return percent < 10 ? `${percent.toFixed(1)}%` : `${Math.round(percent)}%`;
}

export interface GenerationEvent {
  readonly id: string;
  /** The word after `dev.generation.`, e.g. "active" or "failed". */
  readonly state: string;
  readonly version?: number;
  readonly at?: string;
  readonly durationMs?: number;
  readonly changedFiles?: number;
  readonly initial: boolean;
  /** True for the newest activation: the generation the workspace is showing. */
  readonly current: boolean;
  readonly message?: string;
}

const GENERATION_PREFIX = "dev.generation.";

/** Projects `dev.generation.*` supervisor logs newest first; the newest activation is current. */
export function generationEvents(
  items: readonly InspectorObject[],
  limit = 12,
): readonly GenerationEvent[] {
  const events = items
    .flatMap((item) => {
      const message = text(item.message);
      if (!message?.startsWith(GENERATION_PREFIX)) return [];
      return [{ item, state: message.slice(GENERATION_PREFIX.length) || "unknown" }];
    })
    .sort((left, right) => order(right.item) - order(left.item));
  let currentSeen = false;
  return events.slice(0, limit).map(({ item, state }, index) => {
    const fields = record(item.fields);
    const current = !currentSeen && state === "active";
    if (current) currentSeen = true;
    const version = integer(fields?.version);
    const at = timestamp(item.timestamp);
    const durationMs = finite(fields?.durationMs);
    const changedFiles = integer(fields?.changedFiles);
    const message = firstLine(text(fields?.message));
    return {
      id: text(item.cursor) ?? `${state}-${at ?? index}`,
      state,
      initial: fields?.initial === true,
      current,
      ...(version === undefined ? {} : { version }),
      ...(at === undefined ? {} : { at }),
      ...(durationMs === undefined ? {} : { durationMs }),
      ...(changedFiles === undefined ? {} : { changedFiles }),
      ...(message === undefined ? {} : { message }),
    };
  });
}

export interface StorageHealth {
  readonly tone: OverviewTone;
  readonly label: string;
}

/** Collapses the history storage status into one badge word; the full sentence stays elsewhere. */
export function storageHealth(value: InspectorObject | undefined): StorageHealth {
  if (value === undefined) return { tone: "live", label: "checking" };
  if (value.state === "unavailable") return { tone: "neutral", label: "unavailable" };
  if (value.error === "history.writer-conflict")
    return { tone: "danger", label: "writer conflict" };
  if (value.state === "degraded") return { tone: "danger", label: "degraded" };
  if (value.incomplete === true) return { tone: "warning", label: "incomplete" };
  if (value.connection === "disconnected") return { tone: "warning", label: "disconnected" };
  if (value.connection === "ambiguous") return { tone: "warning", label: "ambiguous" };
  return { tone: "success", label: text(value.connection) ?? text(value.state) ?? "ready" };
}

function pathOf(item: InspectorObject): string {
  const route = text(item.normalizedRoute);
  if (route !== undefined && route !== "unknown") return route;
  return text(item.rawPath) ?? text(item.routeId) ?? "request";
}

function order(item: InspectorObject): number {
  const at = timestamp(item.timestamp);
  if (at !== undefined) return Date.parse(at);
  const cursor = Number(text(item.cursor));
  return Number.isFinite(cursor) ? cursor : 0;
}

function firstLine(value: string | undefined): string | undefined {
  const line = value?.split("\n").find((part) => part.trim() !== "");
  if (line === undefined) return undefined;
  const trimmed = line.trim();
  return trimmed.length <= 160 ? trimmed : `${trimmed.slice(0, 159)}…`;
}

function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function integer(value: unknown): number | undefined {
  return Number.isSafeInteger(value) ? (value as number) : undefined;
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function timestamp(value: unknown): string | undefined {
  const result = text(value);
  return result !== undefined && Number.isFinite(Date.parse(result)) ? result : undefined;
}
