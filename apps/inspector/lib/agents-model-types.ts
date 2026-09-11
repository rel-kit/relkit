export interface ToolApprovalView {
  readonly invocationId: string;
  readonly toolCallId: string;
  readonly toolId: string;
  readonly state: "pending" | "approved" | "denied";
  readonly sideEffect?: string;
  readonly policy?: string;
  readonly required?: boolean;
}

export interface ToolRuntimeView {
  readonly id: string;
  readonly invocationId?: string;
  readonly toolCallId?: string;
  readonly traceId?: string;
  readonly requestId?: string;
  readonly status?: string;
  readonly state?: string;
  readonly outcome?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly approval?: ToolApprovalView;
}

export interface SpanView {
  readonly kind: "agent" | "model" | "tool";
  readonly spanId: string;
  readonly invocationId?: string;
  readonly name?: string;
  readonly agentId?: string;
  readonly functionId?: string;
  readonly traceId?: string;
  readonly parentSpanId?: string;
  readonly toolId?: string;
  readonly toolCallId?: string;
  readonly profile?: string;
  readonly step?: number;
  readonly status?: string;
  readonly outcome?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly inputBytes?: number;
  readonly outputBytes?: number;
}

export interface TimelineEntry {
  readonly kind: "invocation" | "agent" | "model" | "tool";
  readonly id: string;
  readonly at: string;
  readonly status?: string;
  readonly outcome?: string;
  readonly spanId?: string;
  readonly parentSpanId?: string;
  readonly toolId?: string;
}

export interface ToolView {
  readonly id: string;
  readonly targetFunctionId: string;
  readonly description: string;
  readonly sideEffect: string;
  readonly approvalPolicy: string;
  readonly timeoutMs?: number;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly errors?: unknown;
  readonly runtime: readonly ToolRuntimeView[];
  readonly pendingApprovals: readonly ToolApprovalView[];
  readonly spans: readonly SpanView[];
  readonly timeline: readonly TimelineEntry[];
}

export interface AgentView {
  readonly id: string;
  readonly model: string;
  readonly client: "internal" | "public" | "protected";
  readonly controls: readonly ("steer" | "follow-up" | "stop" | "approve")[];
  readonly chat: boolean;
  readonly limits?: unknown;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly toolIds: readonly string[];
  readonly generatedFunctionId: string;
  readonly runtime: readonly ToolRuntimeView[];
  readonly spans: readonly SpanView[];
  readonly timeline: readonly TimelineEntry[];
}
