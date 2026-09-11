import type {
  AgentExecutionEvent,
  AgentExecutionSnapshot,
  ThreadSnapshot,
} from "./application-runtime-types";

export function executionUpdate(
  snapshot: ThreadSnapshot,
  event: AgentExecutionEvent,
): Pick<ThreadSnapshot, "values" | "executions"> {
  if (event.scope.length === 0) {
    return {
      values: event.kind === "values" ? mergeValues(snapshot.values, event.value) : snapshot.values,
      executions: snapshot.executions,
    };
  }
  const index = snapshot.executions.findIndex((candidate) =>
    sameScope(candidate.scope, event.scope),
  );
  const prior = index < 0 ? undefined : snapshot.executions[index];
  const next: AgentExecutionSnapshot = {
    scope: event.scope,
    ...((event.agent ?? prior?.agent) ? { agent: event.agent ?? prior?.agent } : {}),
    ...((event.parent ?? prior?.parent) ? { parent: event.parent ?? prior?.parent } : {}),
    ...((event.node ?? prior?.node) ? { node: event.node ?? prior?.node } : {}),
    ...(event.kind === "values"
      ? { values: mergeValues(prior?.values, event.value) }
      : prior?.values === undefined
        ? {}
        : { values: prior.values }),
    status: executionStatus(event) ?? prior?.status ?? "running",
    lastEventSequence: event.nativeSequence,
  };
  return {
    values: snapshot.values,
    executions:
      index < 0
        ? [...snapshot.executions, next]
        : snapshot.executions.map((candidate, position) => (position === index ? next : candidate)),
  };
}

function executionStatus(event: AgentExecutionEvent): AgentExecutionSnapshot["status"] | undefined {
  if (event.kind !== "lifecycle" || !isRecord(event.value)) return undefined;
  const value = event.value.event;
  if (value === "running" || value === "started") return "running";
  if (value === "waiting" || value === "interrupted") return "waiting";
  if (["complete", "completed", "finished", "succeeded"].includes(String(value)))
    return "succeeded";
  if (value === "failed" || value === "error") return "failed";
  if (value === "canceled" || value === "cancelled") return "cancelled";
  return undefined;
}

function mergeValues(prior: unknown, value: unknown): unknown {
  return isRecord(value) ? { ...(isRecord(prior) ? prior : {}), ...value } : prior;
}

function sameScope(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
