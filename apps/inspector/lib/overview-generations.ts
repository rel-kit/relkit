/**
 * The overview's generation history (IN-28): `dev.generation.*` supervisor logs labelled as what
 * happened (a session started, a reload, a restart, a failure) and grouped by `relkit dev` run.
 * Older servers log no `runId` or `reason`; their entries form one unlabelled group.
 */
import type { InspectorObject } from "./api-types";

export interface GenerationEntry {
  readonly id: string;
  readonly state: "active" | "failed" | "other";
  readonly title: string;
  readonly current: boolean;
  readonly at?: string;
  readonly version?: number;
  readonly durationMs?: number;
  /** First lines of the redacted cause of a failure. */
  readonly cause?: readonly string[];
}

export interface GenerationGroup {
  /** The `relkit dev` process; undefined for servers that do not report it. */
  readonly runId?: string;
  /** When the run's first generation started, when it is in the list. */
  readonly startedAt?: string;
  /** This run is the session the Inspector is connected to now. */
  readonly current: boolean;
  /** The run's start record is in the list. */
  readonly startRetained: boolean;
  readonly entries: readonly GenerationEntry[];
}

/** What the Inspector reports about its session with the application. */
export interface GenerationSession {
  readonly state: string;
}

const PREFIX = "dev.generation.";
const CAUSE_LINES = 3;

/**
 * @param items - `dev.generation.*` supervisor logs.
 * @param limit - How many of the newest events to keep.
 * @param session - The Inspector's session with the application. Only a connected session can be
 * current, and then the run of the newest generation event is it: a run that began before the
 * Inspector connected (the normal order, `relkit dev` first) is still the running session, and a
 * newer run would have logged a later start. A run's id is not the session's id (the log removes
 * keys named after sessions, and the tool's status carries no run id), so the two cannot be
 * joined exactly. A connected session while the list holds no generation event at all is shown as
 * an empty current group, whose start is not retained. Without `session`, the newest run is
 * current.
 */
export function generationHistory(
  items: readonly InspectorObject[],
  limit = 12,
  session?: GenerationSession,
): readonly GenerationGroup[] {
  const events = items
    .flatMap((item) => {
      const message = text(item.message);
      return message?.startsWith(PREFIX) ? [{ item, kind: message.slice(PREFIX.length) }] : [];
    })
    .sort((left, right) => order(right.item) - order(left.item))
    .slice(0, limit);
  const currentKey = currentRun(events[0]?.item, session);
  let currentSeen = false;
  const groups = new Map<
    string,
    { runId?: string; startedAt?: string; entries: GenerationEntry[] }
  >();
  events.forEach(({ item, kind }, index) => {
    const fields = record(item.fields) ?? {};
    const runId = text(fields.runId);
    const active = kind === "active" || kind === "swapped";
    const current = active && !currentSeen && (runId ?? "") === currentKey;
    if (current) currentSeen = true;
    const entry = describe(item, kind, fields, index, current);
    const key = runId ?? "";
    const group = groups.get(key) ?? { ...(runId === undefined ? {} : { runId }), entries: [] };
    group.entries.push(entry);
    if (entry.title === "Development session started" && entry.at !== undefined)
      group.startedAt = entry.at;
    groups.set(key, group);
  });
  const result = [...groups.values()].map((group) => ({
    ...group,
    current: (group.runId ?? "") === currentKey,
    startRetained: group.startedAt !== undefined,
  }));
  // The connected session left no record in the list: say so rather than call an old one current.
  if (session?.state === "connected" && currentKey === undefined)
    return [{ current: true, startRetained: false, entries: [] }, ...result];
  return result;
}

/**
 * The run key (`""` for runs without an id) of the connected session, or undefined when no run
 * in the list can be shown as it. `newest` is the newest event.
 */
function currentRun(
  newest: InspectorObject | undefined,
  session: GenerationSession | undefined,
): string | undefined {
  if (newest === undefined) return undefined;
  const key = text(record(newest.fields)?.runId) ?? "";
  if (session === undefined) return key;
  if (session.state !== "connected") return undefined;
  return key;
}

function describe(
  item: InspectorObject,
  kind: string,
  fields: InspectorObject,
  index: number,
  current: boolean,
): GenerationEntry {
  const reason = text(fields.reason);
  const version = integer(fields.version);
  const at = timestamp(item.timestamp);
  const durationMs = finite(fields.durationMs);
  const base = {
    id: text(item.cursor) ?? `${kind}-${at ?? index}`,
    current,
    ...(at === undefined ? {} : { at }),
    ...(version === undefined ? {} : { version }),
    ...(durationMs === undefined ? {} : { durationMs }),
  };
  if (kind === "failed") {
    const message = lines(text(fields.message))[0] ?? "the new version could not start";
    const cause = lines(text(fields.cause)).slice(0, CAUSE_LINES);
    return {
      ...base,
      state: "failed",
      title: `${reason === "restart" ? "Restart" : "Reload"} failed: ${message}`,
      ...(cause.length === 0 ? {} : { cause }),
    };
  }
  if (kind === "active" || kind === "swapped") {
    const started =
      kind === "active" &&
      (reason === "start" || (reason === undefined && fields.initial === true));
    const title = started
      ? "Development session started"
      : kind === "active" && reason === "restart"
        ? "Restarted to apply a change"
        : reloaded(integer(fields.changedFiles));
    return { ...base, state: "active", title };
  }
  return { ...base, state: "other", title: `Generation ${kind || "event"}` };
}

function reloaded(files: number | undefined): string {
  if (files === undefined) return "Reloaded";
  return `Reloaded (${files} file${files === 1 ? "" : "s"} changed)`;
}

function lines(value: string | undefined): string[] {
  return (value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => (line.length <= 160 ? line : `${line.slice(0, 159)}…`));
}

function order(item: InspectorObject): number {
  const at = timestamp(item.timestamp);
  if (at !== undefined) return Date.parse(at);
  const cursor = Number(text(item.cursor));
  return Number.isFinite(cursor) ? cursor : 0;
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
