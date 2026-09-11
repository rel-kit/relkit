import type { AgentExecutionEvent, AgentExecutionSnapshot, ThreadSnapshot } from "@relkit/agents";
import type { LocalAgentThread } from "./state.js";

type Projection = Pick<ThreadSnapshot, "values" | "output" | "executions">;
type MutableExecution = Omit<AgentExecutionSnapshot, "status"> & {
  status?: AgentExecutionSnapshot["status"];
};

export function journalProjection(local: LocalAgentThread): Projection {
  let values: unknown;
  const executions = new Map<string, MutableExecution>();
  for (const record of local.journal) {
    if (record.kind !== "event") continue;
    const event = executionEvent(record.publicValue);
    if (event === undefined) continue;
    if (event.scope.length === 0) {
      if (event.kind === "values") values = mergeValues(values, event.value);
      continue;
    }
    const key = JSON.stringify(event.scope);
    const prior = executions.get(key);
    const status = lifecycleStatus(event) ?? prior?.status;
    executions.set(key, {
      scope: [...event.scope],
      ...(event.agent === undefined ? agentField(prior) : { agent: event.agent }),
      ...(event.parent === undefined ? parentField(prior) : { parent: event.parent }),
      ...(event.node === undefined ? nodeField(prior) : { node: event.node }),
      ...(event.kind === "values"
        ? valueField(mergeValues(prior?.values, event.value))
        : valueField(prior?.values)),
      ...(status === undefined ? {} : { status }),
      lastEventSequence: event.nativeSequence,
    });
  }
  const output = finalOutput(local);
  return {
    ...(values === undefined ? {} : { values }),
    ...(output === undefined ? {} : { output }),
    executions: [...executions.values()].flatMap((execution) =>
      execution.status === undefined ? [] : [execution as AgentExecutionSnapshot],
    ),
  };
}

function finalOutput(local: LocalAgentThread): unknown {
  if (local.activeRunId !== undefined) return undefined;
  const terminal = [...local.journal].reverse().find((record) => record.kind === "terminal");
  if (terminal === undefined || local.runs[terminal.runId]?.outcome !== "succeeded") {
    return undefined;
  }
  return isRecord(terminal.publicValue) && Object.hasOwn(terminal.publicValue, "output")
    ? terminal.publicValue.output
    : undefined;
}

function executionEvent(value: unknown): AgentExecutionEvent | undefined {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.nativeSequence) ||
    typeof value.kind !== "string" ||
    !Array.isArray(value.scope) ||
    !value.scope.every((entry) => typeof entry === "string")
  ) {
    return undefined;
  }
  return value as unknown as AgentExecutionEvent;
}

function lifecycleStatus(event: AgentExecutionEvent): AgentExecutionSnapshot["status"] | undefined {
  if (event.kind !== "lifecycle" || !isRecord(event.value)) return undefined;
  switch (event.value.event) {
    case "running":
    case "started":
      return "running";
    case "waiting":
    case "interrupted":
      return "waiting";
    case "complete":
    case "completed":
    case "finished":
    case "succeeded":
      return "succeeded";
    case "failed":
    case "error":
      return "failed";
    case "canceled":
    case "cancelled":
      return "cancelled";
    default:
      return undefined;
  }
}

function mergeValues(prior: unknown, value: unknown): unknown {
  if (!isRecord(value)) return prior;
  return { ...(isRecord(prior) ? prior : {}), ...value };
}

function agentField(value: MutableExecution | undefined) {
  return value?.agent === undefined ? {} : { agent: value.agent };
}

function parentField(value: MutableExecution | undefined) {
  return value?.parent === undefined ? {} : { parent: value.parent };
}

function nodeField(value: MutableExecution | undefined) {
  return value?.node === undefined ? {} : { node: value.node };
}

function valueField(value: unknown) {
  return value === undefined ? {} : { values: value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
