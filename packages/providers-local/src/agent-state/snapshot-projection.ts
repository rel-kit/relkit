import type { Projection, MutableExecution } from "./snapshot-projection.types.js";
import type { AgentExecutionEvent, AgentExecutionSnapshot } from "@relkit/agents";
import type { LocalAgentThread } from "./state.js";

/**
 * Replays journal entries into browser-visible messages, approvals and execution state.
 * @param local - Thread state owned by the current transaction.
 * @returns The messages, approvals and execution state obtained by replaying the journal.
 */
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

/**
 * Extracts the final output exposed by the journal projection.
 * @param local - Thread state owned by the current transaction.
 * @returns The final projected output when available.
 */
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

/**
 * Projects an execution event into the mutable execution summary.
 * @param value - Untrusted or projected value to inspect.
 * @returns The updated execution projection.
 */
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

/**
 * Maps execution lifecycle events to public execution status.
 * @param event - Journal event to project.
 * @returns The public lifecycle status corresponding to the event.
 */
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

/**
 * Merges record-shaped projected values while preserving replacement semantics.
 * @param value - Untrusted or projected value to inspect.
 * @param prior - Previously retained state or receipt.
 * @returns The merged record or replacement value.
 */
function mergeValues(prior: unknown, value: unknown): unknown {
  if (!isRecord(value)) return prior;
  return { ...(isRecord(prior) ? prior : {}), ...value };
}

/**
 * Reads an optional agent identifier from an execution payload.
 * @param value - Untrusted or projected value to inspect.
 * @returns The optional agent identifier.
 */
function agentField(value: MutableExecution | undefined) {
  return value?.agent === undefined ? {} : { agent: value.agent };
}

/**
 * Reads an optional parent identifier from an execution payload.
 * @param value - Untrusted or projected value to inspect.
 * @returns The optional parent identifier.
 */
function parentField(value: MutableExecution | undefined) {
  return value?.parent === undefined ? {} : { parent: value.parent };
}

/**
 * Reads an optional node identifier from an execution payload.
 * @param value - Untrusted or projected value to inspect.
 * @returns The optional node identifier.
 */
function nodeField(value: MutableExecution | undefined) {
  return value?.node === undefined ? {} : { node: value.node };
}

/**
 * Reads the value carried by a projected execution payload.
 * @param value - Untrusted or projected value to inspect.
 * @returns The projected payload value.
 */
function valueField(value: unknown) {
  return value === undefined ? {} : { values: value };
}

/**
 * Checks for a non-null, non-array object before reading unknown fields.
 * @param value - Untrusted or projected value to inspect.
 * @returns Whether the value is a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
