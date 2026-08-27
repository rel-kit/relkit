import { type MaybePromise } from "@relkit/contracts";
import {
  captureAgentContent,
  createAgentCapturePolicy,
  createAgentSpanCapture,
  type AgentCapturePolicy,
  type AgentCaptureRecord,
  type AgentSpanCapture,
} from "./capture.js";

export {
  captureAgentContent,
  createAgentCapturePolicy,
  createAgentSpanCapture,
} from "./capture.js";
export type { AgentCapturePolicy, AgentCaptureRecord, AgentSpanCapture } from "./capture.js";

export const AGENT_OBSERVABILITY_PROTOCOL = "relkit.observability.hooks" as const;
export const AGENT_OBSERVABILITY_VERSION = 1 as const;

export type AgentSpanKind = "agent" | "model" | "tool";
export type AgentSpanOutcome = "success" | "error" | "cancelled" | "limit";
export type AgentEdgeRelationship =
  | "targets-function"
  | "calls-function"
  | "enqueues-job"
  | "publishes-event"
  | "listens-to-event"
  | "uses-bucket"
  | "uses-cache"
  | "invokes-agent"
  | "exposes-as-tool"
  | "uses-tool"
  | "uses-provider-profile";

export interface AgentObservedEdge {
  readonly relationship: AgentEdgeRelationship;
  readonly from: string;
  readonly to: string;
}

export interface AgentSpanRecord {
  readonly kind?: AgentSpanKind;
  readonly agentId: string;
  readonly invocationId: string;
  readonly functionId: string;
  readonly name: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly traceId: string;
  readonly source: "agent" | "tool";
  readonly status: "started" | "completed";
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly outcome?: AgentSpanOutcome;
  readonly attributes?: Readonly<Record<string, string | number | boolean>>;
  readonly capture?: AgentSpanCapture;
}

export type AgentObservabilityEvent =
  | {
      readonly protocol: typeof AGENT_OBSERVABILITY_PROTOCOL;
      readonly version: typeof AGENT_OBSERVABILITY_VERSION;
      readonly type: "span.started";
      readonly record: AgentSpanRecord;
    }
  | {
      readonly protocol: typeof AGENT_OBSERVABILITY_PROTOCOL;
      readonly version: typeof AGENT_OBSERVABILITY_VERSION;
      readonly type: "span.completed";
      readonly record: AgentSpanRecord;
    }
  | {
      readonly protocol: typeof AGENT_OBSERVABILITY_PROTOCOL;
      readonly version: typeof AGENT_OBSERVABILITY_VERSION;
      readonly type: "edge.observed";
      readonly edge: AgentObservedEdge;
    };

export interface AgentObservabilitySink {
  readonly protocol?: typeof AGENT_OBSERVABILITY_PROTOCOL;
  readonly version?: typeof AGENT_OBSERVABILITY_VERSION;
  readonly emit: (event: AgentObservabilityEvent) => MaybePromise<void>;
}

export interface AgentRuntimeHooks {
  readonly onSpanStart?: (record: AgentSpanRecord) => MaybePromise<void>;
  readonly onSpanComplete?: (record: AgentSpanRecord) => MaybePromise<void>;
  readonly onObservedEdge?: (edge: AgentObservedEdge) => void;
  readonly observability?: AgentObservabilitySink;
}

export function startAgentSpan(options: {
  readonly kind: AgentSpanKind;
  readonly agentId: string;
  readonly invocationId: string;
  readonly functionId: string;
  readonly name: string;
  readonly traceId: string;
  readonly parentSpanId?: string;
  readonly attributes?: Readonly<Record<string, string | number | boolean>>;
}): AgentSpanRecord {
  return Object.freeze({
    ...options,
    spanId: `span-${crypto.randomUUID()}`,
    source: options.kind === "tool" ? "tool" : "agent",
    status: "started" as const,
    startedAt: new Date().toISOString(),
  });
}

export function completeAgentSpan(
  span: AgentSpanRecord,
  outcome: AgentSpanOutcome,
  capture?: AgentSpanCapture,
): AgentSpanRecord {
  return Object.freeze({
    ...span,
    status: "completed" as const,
    completedAt: new Date().toISOString(),
    outcome,
    ...(capture === undefined || (capture.input === undefined && capture.output === undefined)
      ? {}
      : { capture }),
  });
}

export function emitAgentSpanStart(
  hooks: AgentRuntimeHooks | undefined,
  record: AgentSpanRecord,
): void {
  notify(hooks?.onSpanStart, record);
  void emit(hooks?.observability, {
    protocol: AGENT_OBSERVABILITY_PROTOCOL,
    version: 1,
    type: "span.started",
    record,
  });
}

export function emitAgentSpanComplete(
  hooks: AgentRuntimeHooks | undefined,
  record: AgentSpanRecord,
): void {
  notify(hooks?.onSpanComplete, record);
  void emit(hooks?.observability, {
    protocol: AGENT_OBSERVABILITY_PROTOCOL,
    version: 1,
    type: "span.completed",
    record,
  });
}

export function emitAgentEdge(hooks: AgentRuntimeHooks | undefined, edge: AgentObservedEdge): void {
  const safe = Object.freeze({ ...edge });
  notify(hooks?.onObservedEdge, safe);
  void emit(hooks?.observability, {
    protocol: AGENT_OBSERVABILITY_PROTOCOL,
    version: 1,
    type: "edge.observed",
    edge: safe,
  });
}

function notify<T>(hook: ((value: T) => MaybePromise<void>) | undefined, value: T): void {
  try {
    const result = hook?.(value);
    if (result !== undefined) void Promise.resolve(result).catch(() => undefined);
  } catch {}
}

async function emit(
  sink: AgentObservabilitySink | undefined,
  event: AgentObservabilityEvent,
): Promise<void> {
  try {
    await sink?.emit(Object.freeze(event));
  } catch {}
}
