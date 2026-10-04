import type { API_VERSION, PROTOCOL_VERSION, MaybePromise } from "@relkit/contracts";
import type { InspectorMode, ResolvedActiveGeneration } from "./shared.js";
import type { InspectorActionIdentity } from "./actions-schema.types.js";
import type { Effect } from "effect";
import type { InspectorBoundaryError } from "./native-edge.js";

/** Declared Inspector action vocabulary; input data never becomes an operation label. */
export type InspectorActionName =
  | "function.invoke"
  | "job.retry"
  | "job.cancel"
  | "event.retry"
  | "event.cancel"
  | "tool.approve"
  | "tool.deny";

/** Schema-derived action identity plus the native function target, input and cancellation signal. */
export interface InspectorFunctionActionRequest extends InspectorActionIdentity {
  readonly functionId: string;
  readonly input: unknown;
  readonly signal?: AbortSignal;
}

/** Native active-function authority used only after action identity and privilege validation. */
export interface InspectorFunctionActionService {
  readonly invoke: (request: InspectorFunctionActionRequest) => MaybePromise<unknown>;
  readonly exists?: (functionId: string) => MaybePromise<boolean>;
}

/** Versioned native job administration request with a bounded optional reason. */
export interface InspectorJobActionRequest {
  readonly protocol: "relkit.jobs.admin";
  readonly version: typeof PROTOCOL_VERSION;
  readonly instanceId: string;
  readonly reason?: string;
}

/** Native job status and administration capabilities; absent methods remain unsupported. */
export interface InspectorJobActionService {
  readonly protocol?: string;
  readonly version?: number;
  readonly status?: (instanceId: string) => MaybePromise<unknown>;
  readonly retry?: (request: InspectorJobActionRequest) => MaybePromise<unknown>;
  readonly cancel?: (request: InspectorJobActionRequest) => MaybePromise<unknown>;
}

/** Versioned native event delivery administration request. */
export interface InspectorEventActionRequest {
  readonly protocol: "relkit.events.admin";
  readonly version: typeof PROTOCOL_VERSION;
  readonly deliveryId: string;
  readonly reason?: string;
}

/** Native event status and administration capabilities without synthetic fallback operations. */
export interface InspectorEventActionService {
  readonly protocol?: string;
  readonly version?: number;
  readonly status?: (deliveryId: string) => MaybePromise<unknown>;
  readonly retry?: (request: InspectorEventActionRequest) => MaybePromise<unknown>;
  readonly cancel?: (request: InspectorEventActionRequest) => MaybePromise<unknown>;
}

/** Existing authoritative tool decision states. */
export type InspectorToolApprovalState = "pending" | "approved" | "denied";

/** Native approval identity and policy evidence selected before dispatch. */
export interface InspectorToolApprovalRecord {
  readonly invocationId: string;
  readonly toolCallId: string;
  readonly toolId: string;
  readonly state: InspectorToolApprovalState;
  readonly sideEffect?: string;
  readonly policy?: string;
  readonly required?: boolean;
}

/** Native approval identity bound to an authoritative idempotency key. */
export interface InspectorToolApprovalRequest {
  readonly invocationId: string;
  readonly toolCallId: string;
  readonly toolId: string;
  readonly idempotencyKey: string;
}

/** Native approval lookup and optional decision authorities. */
export interface InspectorToolApprovalService {
  readonly get: (
    request: Omit<InspectorToolApprovalRequest, "idempotencyKey">,
  ) => MaybePromise<InspectorToolApprovalRecord | undefined>;
  readonly approve?: (request: InspectorToolApprovalRequest) => MaybePromise<unknown>;
  readonly deny?: (request: InspectorToolApprovalRequest) => MaybePromise<unknown>;
}

/** Versioned redacted action evidence retaining active generation and environment identity. */
export interface InspectorAuditRecord {
  readonly protocol: "relkit.inspector.actions";
  readonly version: typeof API_VERSION;
  readonly actionId: string;
  readonly action: InspectorActionName;
  readonly targetId: string;
  readonly generationId: string;
  readonly graphHash: string;
  readonly environment: InspectorMode;
  readonly idempotencyKey: string;
  readonly outcome: "applied" | "rejected";
  readonly requestedAt: string;
  readonly errorCode?: string;
  readonly reason?: string;
}

/** Native action authorities retained by the active generation, including best-effort audit delivery. */
export interface InspectorActionServices {
  readonly functions?: InspectorFunctionActionService;
  readonly invokeFunction?: InspectorFunctionActionService["invoke"];
  readonly jobs?: InspectorJobActionService;
  readonly events?: InspectorEventActionService;
  readonly approvals?: InspectorToolApprovalService;
  readonly tools?: { readonly approvals?: InspectorToolApprovalService };
  readonly audit?: (record: InspectorAuditRecord) => MaybePromise<void>;
}

/** Native Hono action installation options preserving production protection and active-generation lookup. */
export interface InspectorActionEndpointOptions {
  readonly mode: InspectorMode;
  readonly enabled: boolean;
  readonly authorize: (request: Request) => MaybePromise<boolean>;
  readonly getGeneration: () => Promise<ResolvedActiveGeneration | undefined>;
  /** Optional lazy resolution supplied by the owning router's service composition. */
  readonly generationEffect?: Effect.Effect<
    ResolvedActiveGeneration | undefined,
    InspectorBoundaryError
  >;
}

/** Schema-derived active identity plus the declared action, target and parsed body. */
export interface InspectorActionRequest extends InspectorActionIdentity {
  readonly action: InspectorActionName;
  readonly targetId: string;
  readonly body: Record<string, unknown>;
  readonly signal?: AbortSignal;
}
