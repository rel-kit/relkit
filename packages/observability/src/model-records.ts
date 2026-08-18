import type {
  InvocationSource,
  RequestDetail,
  RequestOutcome,
  VersionedRecord,
} from "./model-shared.js";

/** Completed accepted HTTP request metadata; bodies and protected headers are absent by design. */
export interface RequestRecord extends VersionedRecord<"request"> {
  readonly requestId: string;
  readonly traceId: string;
  readonly generationId: string;
  readonly graphHash: string;
  readonly invocationId: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly method: string;
  readonly rawPath: string;
  readonly normalizedRoute: string;
  readonly routeId: string;
  readonly functionId: string;
  readonly status: number;
  readonly requestBytes?: number;
  readonly responseBytes?: number;
  readonly outcome: RequestOutcome;
  readonly errorId?: string;
  readonly timeline: readonly RequestDetail[];
}

/** Invocation metadata compatible with the Phase 4–10 engine hook record. */
export interface InvocationRecord extends VersionedRecord<"invocation"> {
  readonly id: string;
  readonly functionId: string;
  readonly traceId: string;
  readonly parentId?: string;
  readonly startedAt: string;
  readonly deadline?: string;
  readonly attempt: number;
  readonly source: InvocationSource;
  readonly status: "started" | RequestOutcome | "provider-failure";
  readonly completedAt?: string;
  readonly durationMs?: number;
}

export type JobState =
  "accepted" | "available" | "leased" | "delayed" | "completed" | "dead-lettered";
export interface JobRecord extends VersionedRecord<"job"> {
  readonly jobId: string;
  readonly instanceId: string;
  readonly functionId: string;
  readonly profile: string;
  readonly state: JobState;
  readonly attempt: number;
  readonly acceptedAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly inputBytes?: number;
  readonly outputBytes?: number;
  readonly errorId?: string;
}

export type EventRecordKind = "publication" | "delivery";
export type EventRecordState =
  "accepted" | "published" | "started" | "delivered" | "retrying" | "failed" | "dead-lettered";
export interface EventRecord extends VersionedRecord<"event"> {
  readonly kind: EventRecordKind;
  readonly eventId: string;
  readonly eventVersion: number;
  readonly instanceId: string;
  readonly state: EventRecordState;
  readonly deliveryId?: string;
  readonly triggerId?: string;
  readonly functionId?: string;
  readonly causationInvocationId?: string;
  readonly occurredAt: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly payloadBytes?: number;
  readonly attempt?: number;
  readonly errorId?: string;
}

export type ResourceKind = "bucket" | "cache";
export type ResourceOperation =
  | "put"
  | "get"
  | "head"
  | "delete"
  | "exists"
  | "list"
  | "createReadUrl"
  | "createWriteUrl"
  | "set"
  | "getOrSet"
  | "has"
  | "increment";
export type ResourceOutcome =
  "success" | "provider-failure" | "cancelled" | "timeout" | "unsupported" | "validation-error";
export interface ResourceRecord extends VersionedRecord<"resource"> {
  readonly kind: ResourceKind;
  readonly resourceId: string;
  readonly operation: ResourceOperation;
  readonly ownerId: string;
  readonly outcome: ResourceOutcome;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly bytes?: number;
}

export type ToolApproval = "not-required" | "pending" | "approved" | "denied";
export type ToolOutcome =
  | "success"
  | "validation-error"
  | "approval-denied"
  | "provider-failure"
  | "cancelled"
  | "timeout"
  | "defect";
export interface ToolRecord extends VersionedRecord<"tool"> {
  readonly toolId: string;
  readonly functionId: string;
  readonly agentId?: string;
  readonly sideEffect: "none" | "read" | "write" | "external";
  readonly approval: ToolApproval;
  readonly outcome: ToolOutcome;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly argumentBytes?: number;
  readonly resultBytes?: number;
  readonly errorId?: string;
}
