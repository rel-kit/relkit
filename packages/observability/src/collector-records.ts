import {
  OBSERVABILITY_MODEL_VERSION,
  type AgentTurnRecord,
  type InvocationRecord,
  type LogRecord,
  type SpanRecord,
} from "./model.js";
import { INVOCATION_OUTCOMES, isRecord, type RecordLike, text } from "./collector-values.js";
export function invocationRecord(value: RecordLike): InvocationRecord | undefined {
  const id = text(value.id);
  const functionId = text(value.functionId);
  const traceId = text(value.traceId);
  const startedAt = text(value.startedAt);
  if (
    id === undefined ||
    functionId === undefined ||
    traceId === undefined ||
    startedAt === undefined
  )
    return undefined;
  const parentId = text(value.parentId),
    requestId = text(value.requestId);
  const correlationId = text(value.correlationId),
    serviceId = text(value.serviceId);
  const deadline = text(value.deadline);
  const completedAt = text(value.completedAt);
  const durationMs = numberValue(value.durationMs);
  const status = INVOCATION_OUTCOMES.has(String(value.status))
    ? (String(value.status) as InvocationRecord["status"])
    : "started";
  return {
    version: OBSERVABILITY_MODEL_VERSION,
    signal: "invocation",
    id,
    functionId,
    traceId,
    ...(requestId === undefined ? {} : { requestId }),
    ...(parentId === undefined ? {} : { parentId }),
    ...(correlationId === undefined ? {} : { correlationId }),
    ...(serviceId === undefined ? {} : { serviceId }),
    startedAt,
    ...(deadline === undefined ? {} : { deadline }),
    attempt: integer(value.attempt, 1),
    source: sourceValue(value.source) ?? "direct",
    status,
    ...(completedAt === undefined ? {} : { completedAt }),
    ...(durationMs === undefined ? {} : { durationMs }),
  };
}
export function spanRecord(value: RecordLike): SpanRecord | undefined {
  const spanId = text(value.spanId);
  const invocationId = text(value.invocationId);
  const traceId = text(value.traceId);
  const name = text(value.name);
  const startedAt = text(value.startedAt);
  if (
    spanId === undefined ||
    invocationId === undefined ||
    traceId === undefined ||
    name === undefined ||
    startedAt === undefined
  )
    return undefined;
  const completedAt = text(value.completedAt);
  const duration = numberValue(value.durationMs);
  const functionId = text(value.functionId),
    parentSpanId = text(value.parentSpanId);
  const requestId = text(value.requestId),
    serviceId = text(value.serviceId);
  const sourceValueResult = sourceValue(value.source);
  const outcomeValue = outcome(value.outcome);
  return {
    version: OBSERVABILITY_MODEL_VERSION,
    signal: "span",
    spanId,
    invocationId,
    traceId,
    ...(requestId === undefined ? {} : { requestId }),
    name,
    ...(functionId === undefined ? {} : { functionId }),
    ...(serviceId === undefined ? {} : { serviceId }),
    ...(parentSpanId === undefined ? {} : { parentSpanId }),
    ...(sourceValueResult === undefined ? {} : { source: sourceValueResult }),
    status: value.status === "completed" ? "completed" : "started",
    startedAt,
    ...(completedAt === undefined ? {} : { completedAt }),
    ...(duration === undefined ? {} : { durationMs: duration }),
    ...(outcomeValue === undefined ? {} : { outcome: outcomeValue }),
  };
}
export function agentTurnRecord(value: RecordLike): AgentTurnRecord | undefined {
  const agentId = text(value.agentId);
  const turnId = text(value.spanId);
  const invocationId = text(value.invocationId);
  const traceId = text(value.traceId);
  const functionId = text(value.functionId);
  const startedAt = text(value.startedAt);
  if (
    agentId === undefined ||
    turnId === undefined ||
    invocationId === undefined ||
    traceId === undefined ||
    functionId === undefined ||
    startedAt === undefined
  )
    return undefined;
  const attributes = isRecord(value.attributes) ? value.attributes : undefined;
  const kind = value.kind === "model" || value.kind === "tool" ? value.kind : "agent";
  const input = captureBytes(value.capture, "input");
  const output = captureBytes(value.capture, "output");
  const parentSpanId = text(value.parentSpanId);
  const profile = text(attributes?.["relkit.model.profile"]);
  const toolId = text(attributes?.["relkit.tool.id"]);
  const toolCallId = text(attributes?.["relkit.tool.call.id"]);
  const completedAt = text(value.completedAt);
  const outcome = agentOutcome(value.outcome);
  return {
    version: OBSERVABILITY_MODEL_VERSION,
    signal: "agent",
    kind,
    agentId,
    turnId,
    invocationId,
    traceId,
    functionId,
    ...(parentSpanId === undefined ? {} : { parentSpanId }),
    ...(profile === undefined ? {} : { profile }),
    ...(toolId === undefined ? {} : { toolId }),
    ...(toolCallId === undefined ? {} : { toolCallId }),
    step: integer(attributes?.["relkit.agent.step"], 0),
    status: value.status === "completed" ? "completed" : "started",
    startedAt,
    ...(completedAt === undefined ? {} : { completedAt }),
    ...(outcome === undefined ? {} : { outcome }),
    ...(input === undefined ? {} : { inputBytes: input }),
    ...(output === undefined ? {} : { outputBytes: output }),
  };
}

export function logRecord(value: RecordLike): LogRecord | undefined {
  const timestamp = text(value.timestamp);
  const component = text(value.component);
  const message = text(value.message);
  const source = text(value.source),
    functionId = text(value.functionId);
  const level = value.level;
  if (
    timestamp === undefined ||
    component === undefined ||
    message === undefined ||
    !["trace", "debug", "info", "warn", "error", "fatal"].includes(String(level))
  )
    return undefined;
  return {
    version: OBSERVABILITY_MODEL_VERSION,
    signal: "log",
    timestamp,
    level: level as LogRecord["level"],
    component,
    message,
    fields: (isRecord(value.fields) ? value.fields : {}) as LogRecord["fields"],
    ...(functionId === undefined ? {} : { functionId }),
    ...correlation(value),
    ...(source === undefined ? {} : { source }),
  };
}
function correlation(value: RecordLike): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of "requestId invocationId traceId spanId correlationId serviceId".split(" "))
    if (text(value[key]) !== undefined) result[key] = text(value[key])!;
  return result;
}

function captureBytes(value: unknown, key: string): number | undefined {
  return isRecord(value) && isRecord(value[key]) ? numberValue(value[key].bytes) : undefined;
}

function sourceValue(value: unknown): SpanRecord["source"] | undefined {
  return ["direct", "http", "job", "event", "tool", "agent"].includes(String(value))
    ? (value as SpanRecord["source"])
    : undefined;
}

function outcome(value: unknown): SpanRecord["outcome"] | undefined {
  return INVOCATION_OUTCOMES.has(String(value)) ? (value as SpanRecord["outcome"]) : undefined;
}

function agentOutcome(value: unknown): AgentTurnRecord["outcome"] | undefined {
  return ["success", "error", "cancelled", "limit"].includes(String(value))
    ? (value as AgentTurnRecord["outcome"])
    : undefined;
}

function integer(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : fallback;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
