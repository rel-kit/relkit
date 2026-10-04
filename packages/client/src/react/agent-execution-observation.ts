import type { AgentExecutionProjection } from "./agent-execution-observation.types.js";
import type {
  AgentClientEvent,
  AgentExecutionEvent,
  AgentExecutionSnapshot,
  ThreadSnapshot,
} from "@relkit/contracts";
export type { AgentExecutionProjection } from "./agent-execution-observation.types.js";

/**
 * Projects authoritative execution state into the existing browser agent shape.
 * @typeParam Output - Declared successful output payload.
 * @param current - Current external-store state.
 * @param event - Canonical observation event.
 * @returns Browser agent state projected from authoritative execution state.
 */
export function executionProjection<Output>(
  current: AgentExecutionProjection<Output>,
  event: AgentExecutionEvent,
): AgentExecutionProjection<Output> {
  if (event.scope.length === 0) {
    return event.kind === "values"
      ? { ...current, ...valueField(mergeValues(current.values, event.value)) }
      : current;
  }
  const index = current.executions.findIndex(
    (candidate) => JSON.stringify(candidate.scope) === JSON.stringify(event.scope),
  );
  const prior = index < 0 ? undefined : current.executions[index];
  const next: AgentExecutionSnapshot = {
    scope: [...event.scope],
    ...(event.agent === undefined ? agentField(prior) : { agent: event.agent }),
    ...(event.parent === undefined ? parentField(prior) : { parent: event.parent }),
    ...(event.node === undefined ? nodeField(prior) : { node: event.node }),
    ...(event.kind === "values"
      ? valueField(mergeValues(prior?.values, event.value))
      : valueField(prior?.values)),
    status: lifecycleStatus(event) ?? prior?.status ?? "running",
    lastEventSequence: event.nativeSequence,
  };
  return {
    ...current,
    executions:
      index < 0
        ? [...current.executions, next]
        : current.executions.map((candidate, offset) => (offset === index ? next : candidate)),
  };
}

/**
 * Projects a thread snapshot through its canonical executions.
 * @typeParam Output - Declared successful output payload.
 * @param snapshot - Authoritative thread or execution snapshot.
 * @returns Browser agent state projected from the thread executions.
 */
export function snapshotProjection<Output>(
  snapshot: ThreadSnapshot,
): AgentExecutionProjection<Output> {
  return {
    ...(snapshot.values === undefined ? {} : { values: snapshot.values }),
    ...(snapshot.output === undefined ? {} : { output: snapshot.output as Output }),
    executions: snapshot.executions,
  };
}

/**
 * Updates the browser snapshot projection without widening authority.
 * @typeParam Snapshot - Authoritative snapshot type.
 * @param snapshot - Authoritative thread or execution snapshot.
 * @param projection - Existing projection supplied by the owning operation.
 * @param event - Canonical observation event.
 * @returns The snapshot with its browser execution projection updated.
 */
export function updateSnapshotProjection<Snapshot extends ThreadSnapshot>(
  snapshot: Snapshot,
  projection: AgentExecutionProjection,
  event: AgentClientEvent,
): Snapshot {
  const { values: _values, output: _output, executions: _executions, ...base } = snapshot;
  const terminal = event.kind === "run-finished" ? terminalOutcome(event.value) : undefined;
  return {
    ...base,
    ...(terminal === undefined || snapshot.activeRun?.runId !== event.runId
      ? {}
      : { activeRun: undefined }),
    currentRuns:
      terminal === undefined
        ? snapshot.currentRuns
        : snapshot.currentRuns.map((run) =>
            run.runId === event.runId
              ? { ...run, status: terminal, outcome: terminal, settledAt: event.createdAt }
              : run,
          ),
    ...(projection.values === undefined ? {} : { values: projection.values }),
    ...(projection.output === undefined ? {} : { output: projection.output }),
    executions: projection.executions,
    checkpoint: event.checkpoint,
  } as Snapshot;
}

/**
 * Projects a native terminal envelope without fabricating missing output.
 * @typeParam Output - Declared successful output payload.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns Available terminal fields projected without inventing output.
 */
export function terminalProjection<Output>(value: unknown) {
  if (!isRecord(value)) return { status: "failed" as const };
  const status =
    value.outcome === "cancelled"
      ? ("cancelled" as const)
      : value.outcome === "succeeded"
        ? ("succeeded" as const)
        : ("failed" as const);
  return {
    status,
    ...(status === "succeeded" && Object.hasOwn(value, "output")
      ? { output: value.output as Output }
      : {}),
  };
}

/**
 * Reads an existing terminal outcome field.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns The declared succeeded, failed or cancelled outcome.
 */
function terminalOutcome(value: unknown): "succeeded" | "failed" | "cancelled" {
  if (!isRecord(value)) return "failed";
  return value.outcome === "succeeded" || value.outcome === "cancelled" ? value.outcome : "failed";
}

/**
 * Projects canonical client events into the existing browser execution event shape.
 * @param event - Canonical observation event.
 * @returns The canonical client event projected into browser event fields.
 */
export function clientEventProjection(event: AgentClientEvent): unknown {
  if (event.kind !== "execution-event" || event.value.kind !== "custom") return event;
  const value = event.value.value;
  if (!isRecord(value) || typeof value.name !== "string" || !("data" in value)) return event;
  return {
    eventId: event.eventId,
    recordId: event.recordId,
    runId: event.runId,
    checkpoint: event.checkpoint,
    createdAt: event.createdAt,
    scope: event.value.scope,
    kind: "custom",
    name: value.name,
    data: value.data,
  };
}

/**
 * Maps the existing lifecycle phase into browser status.
 * @param event - Canonical observation event.
 * @returns The matching execution status, or undefined for another phase.
 */
function lifecycleStatus(event: AgentExecutionEvent): AgentExecutionSnapshot["status"] | undefined {
  if (event.kind !== "lifecycle" || !isRecord(event.value)) return undefined;
  const value = event.value.event;
  if (value === "running" || value === "started") return "running";
  if (value === "waiting" || value === "interrupted") return "waiting";
  if (["complete", "completed", "finished", "succeeded"].includes(String(value))) {
    return "succeeded";
  }
  if (value === "failed" || value === "error") return "failed";
  if (value === "canceled" || value === "cancelled") return "cancelled";
  return undefined;
}

/**
 * Merges authoritative values only when both sides are record-like.
 * @param prior - Existing prior supplied by the owning operation.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns Merged record fields, or the authoritative replacement value.
 */
function mergeValues(prior: unknown, value: unknown): unknown {
  if (!isRecord(value)) return prior;
  return { ...(isRecord(prior) ? prior : {}), ...value };
}

/**
 * Reads the canonical agent identity field.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns The canonical agent identity field.
 */
function agentField(value: AgentExecutionSnapshot | undefined) {
  return value?.agent === undefined ? {} : { agent: value.agent };
}
/**
 * Reads the canonical parent execution field.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns The canonical parent execution field.
 */
function parentField(value: AgentExecutionSnapshot | undefined) {
  return value?.parent === undefined ? {} : { parent: value.parent };
}
/**
 * Reads the canonical node field.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns The canonical execution node field.
 */
function nodeField(value: AgentExecutionSnapshot | undefined) {
  return value?.node === undefined ? {} : { node: value.node };
}
/**
 * Reads the canonical execution value field.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns The canonical execution value field.
 */
function valueField(value: unknown) {
  return value === undefined ? {} : { values: value };
}
/**
 * Checks whether the existing property-access boundary accepts a supplied value.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns Whether property access is valid for this boundary.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
