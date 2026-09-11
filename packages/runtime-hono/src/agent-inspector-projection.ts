import type { AgentExecutionEvent, JournalRecord, StoredRun, ThreadSnapshot } from "@relkit/agents";
import { agentRunCompatibility } from "./agent-compatibility.js";

export function inspectorRuns(snapshot: ThreadSnapshot): readonly Record<string, unknown>[] {
  return snapshot.currentRuns.map((run) => ({
    runId: run.runId,
    status: run.status,
    acceptedAt: run.acceptedAt,
    ...(run.settledAt === undefined ? {} : { completedAt: run.settledAt }),
    compatibility: agentRunCompatibility(run, snapshot.waiting?.runId),
  }));
}

export function inspectorExecutions(snapshot: ThreadSnapshot): readonly Record<string, unknown>[] {
  return snapshot.executions.map((execution) => ({
    scope: execution.scope,
    ...(execution.agent === undefined ? {} : { agent: execution.agent }),
    ...(execution.parent === undefined ? {} : { parent: execution.parent }),
    ...(execution.node === undefined ? {} : { node: execution.node }),
    status: execution.status,
    lastEventSequence: execution.lastEventSequence,
  }));
}

export function inspectorAttempts(
  records: readonly JournalRecord[],
  runs: ReadonlySet<string>,
): readonly Record<string, unknown>[] {
  const counters = new Map<string, number>();
  const attempts = new Map<string, Record<string, unknown>>();
  for (const record of records) {
    if (record.kind !== "event" || !runs.has(record.runId)) continue;
    const event = executionEvent(record.publicValue);
    const task = event === undefined ? undefined : taskValue(event.value);
    if (event?.kind !== "tasks" || task === undefined) continue;
    const baseKey = [
      record.runId,
      ...event.scope,
      event.node ?? "",
      task.id ?? task.name ?? "task",
    ].join("\0");
    let attempt = counters.get(baseKey) ?? 0;
    if (task.status === "started" || attempt === 0) {
      attempt += 1;
      counters.set(baseKey, attempt);
    }
    const id = [
      "attempt",
      record.runId,
      ...event.scope,
      event.node ?? "root",
      task.id ?? task.name ?? "task",
      String(attempt),
    ]
      .map(encodeURIComponent)
      .join(":");
    const prior = attempts.get(id) ?? {};
    attempts.set(id, {
      ...prior,
      id,
      runId: record.runId,
      scope: event.scope,
      ...(event.agent === undefined ? {} : { agent: event.agent }),
      ...(event.parent === undefined ? {} : { parent: event.parent }),
      ...(event.node === undefined ? {} : { node: event.node }),
      ...(task.id === undefined ? {} : { taskId: task.id }),
      ...(task.name === undefined ? {} : { name: task.name }),
      attempt,
      status: task.status,
      ...(task.status === "started" ? { startedAt: event.occurredAt } : {}),
      ...(task.status === "started" ? {} : { completedAt: event.occurredAt }),
      occurredAt: event.occurredAt,
    });
  }
  return [...attempts.values()];
}

export function inspectorTransitions(
  records: readonly JournalRecord[],
  runs: ReadonlySet<string>,
): readonly Record<string, unknown>[] {
  return records.flatMap((record) => {
    if (record.kind !== "event" || !runs.has(record.runId)) return [];
    const event = executionEvent(record.publicValue);
    if (event?.kind !== "lifecycle") return [];
    const value = isRecord(event.value) ? event.value : {};
    const cause = isRecord(value.cause) ? value.cause : {};
    return [
      {
        runId: record.runId,
        scope: event.scope,
        kind: typeof value.event === "string" ? value.event : "lifecycle",
        ...(typeof cause.from_node === "string" ? { from: cause.from_node } : {}),
        ...(event.node === undefined ? {} : { to: event.node }),
        occurredAt: event.occurredAt,
      },
    ];
  });
}

export function inspectedRunIds(snapshot: ThreadSnapshot, mode: "live" | "history"): Set<string> {
  if (mode === "history") return new Set(snapshot.currentRuns.map((run) => run.runId));
  const live = snapshot.currentRuns.filter((run) => !terminal(run)).map((run) => run.runId);
  return new Set(live.length > 0 ? live : snapshot.currentRuns.slice(-1).map((run) => run.runId));
}

function executionEvent(value: unknown): AgentExecutionEvent | undefined {
  if (!isRecord(value) || !Array.isArray(value.scope) || typeof value.kind !== "string") return;
  if (typeof value.nativeSequence !== "number" || typeof value.occurredAt !== "string") return;
  return value as unknown as AgentExecutionEvent;
}

function taskValue(value: unknown): { id?: string; name?: string; status: string } | undefined {
  if (!isRecord(value) || typeof value.status !== "string") return;
  return {
    ...(typeof value.id === "string" ? { id: value.id } : {}),
    ...(typeof value.name === "string" ? { name: value.name } : {}),
    status: value.status,
  };
}

function terminal(run: StoredRun): boolean {
  return ["succeeded", "failed", "cancelled", "worker-interrupted"].includes(run.status);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
