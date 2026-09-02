import type {
  InvocationOutcome,
  InvocationSource,
  RequestOutcome,
  SafeAttributes,
  SafeFields,
  VersionedRecord,
} from "./model-shared.js";
import type {
  EventRecord,
  InvocationRecord,
  JobRecord,
  RequestRecord,
  ResourceRecord,
  ToolRecord,
} from "./model-records.js";

export type AgentTurnKind = "agent" | "model" | "tool";
export type AgentTurnOutcome = "success" | "error" | "cancelled" | "limit";
export interface AgentTurnRecord extends VersionedRecord<"agent"> {
  readonly kind: AgentTurnKind;
  readonly agentId: string;
  readonly turnId: string;
  readonly invocationId: string;
  readonly traceId: string;
  readonly functionId?: string;
  readonly profile?: string;
  readonly toolId?: string;
  readonly toolCallId?: string;
  readonly parentSpanId?: string;
  readonly step: number;
  readonly status: "started" | "completed";
  readonly outcome?: AgentTurnOutcome;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly inputBytes?: number;
  readonly outputBytes?: number;
}

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";
export interface LogRecord extends VersionedRecord<"log"> {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly component: string;
  readonly functionId?: string;
  readonly message: string;
  readonly fields: SafeFields;
  readonly spanId?: string;
  readonly source?: string;
}

export interface SpanRecord extends VersionedRecord<"span"> {
  readonly spanId: string;
  readonly invocationId: string;
  readonly traceId: string;
  readonly name: string;
  readonly functionId?: string;
  readonly parentSpanId?: string;
  readonly source?: InvocationSource;
  readonly status: "started" | "completed";
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly outcome?: InvocationOutcome;
  readonly attributes?: SafeAttributes;
}

export interface TraceRecord extends VersionedRecord<"trace"> {
  readonly traceId: string;
  readonly functionId?: string;
  readonly rootInvocationId?: string;
  readonly rootSpanId?: string;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly spanCount: number;
  readonly outcome?: RequestOutcome | InvocationOutcome;
}

export type DiagnosticSeverity = "info" | "warning" | "error";
export interface DiagnosticLocationRecord {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}
export interface DiagnosticRecord extends VersionedRecord<"diagnostic"> {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly occurredAt: string;
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
  readonly descriptorId?: string;
  readonly related?: readonly DiagnosticLocationRecord[];
  readonly suggestion?: string;
  readonly documentationPath?: string;
}

export type GenerationEvent =
  "created" | "started" | "ready" | "activated" | "draining" | "stopped" | "failed";
export interface GenerationRecord extends VersionedRecord<"generation"> {
  readonly generationId: string;
  readonly graphHash: string;
  readonly activationFingerprint: import("@relkit/contracts").RuntimeActivationFingerprint;
  readonly event: GenerationEvent;
  readonly occurredAt: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly sourceVersion?: number;
  readonly errorCode?: string;
}

export type ObservabilityRecord =
  | RequestRecord
  | InvocationRecord
  | JobRecord
  | EventRecord
  | ResourceRecord
  | ToolRecord
  | AgentTurnRecord
  | LogRecord
  | SpanRecord
  | TraceRecord
  | DiagnosticRecord
  | GenerationRecord;
