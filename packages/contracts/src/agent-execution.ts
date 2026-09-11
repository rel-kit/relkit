export interface AgentExecutionEvent {
  readonly nativeSequence: number;
  readonly kind: string;
  readonly scope: readonly string[];
  readonly occurredAt: string;
  readonly agent?: string;
  readonly parent?: {
    readonly kind: "tool";
    readonly toolCallId: string;
    readonly toolId: string;
  };
  readonly node?: string;
  readonly value?: unknown;
}

export interface AgentExecutionSnapshot {
  readonly scope: readonly string[];
  readonly agent?: string;
  readonly parent?: AgentExecutionEvent["parent"];
  readonly node?: string;
  readonly values?: unknown;
  readonly status: "running" | "waiting" | "succeeded" | "failed" | "cancelled";
  readonly lastEventSequence: number;
}
