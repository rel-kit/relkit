import { API_BASE_PATH, API_VERSION, PROTOCOL_VERSION, type MaybePromise } from "@relkit/contracts";
import { errorResponse, json, negotiate } from "./router-utils.js";
import { executeInspectorAction, parseInspectorAction } from "./actions-runtime.js";
import type { InspectorActionResult } from "./actions-runtime.js";
import { InspectorActionError } from "./actions-errors.js";
import type { InspectorMode, ResolvedActiveGeneration } from "./shared.js";
import type { Context, Hono } from "hono";
export type InspectorActionName =
  | "function.invoke"
  | "job.retry"
  | "job.cancel"
  | "event.retry"
  | "event.cancel"
  | "tool.approve"
  | "tool.deny";

export interface InspectorFunctionActionRequest {
  readonly generationId: string;
  readonly graphHash: string;
  readonly functionId: string;
  readonly input: unknown;
  readonly idempotencyKey: string;
  readonly signal?: AbortSignal;
}

export interface InspectorFunctionActionService {
  readonly invoke: (request: InspectorFunctionActionRequest) => MaybePromise<unknown>;
  readonly exists?: (functionId: string) => MaybePromise<boolean>;
}

export interface InspectorJobActionRequest {
  readonly protocol: "relkit.jobs.admin";
  readonly version: typeof PROTOCOL_VERSION;
  readonly instanceId: string;
  readonly reason?: string;
}

export interface InspectorJobActionService {
  readonly protocol?: string;
  readonly version?: number;
  readonly status?: (instanceId: string) => MaybePromise<unknown>;
  readonly retry?: (request: InspectorJobActionRequest) => MaybePromise<unknown>;
  readonly cancel?: (request: InspectorJobActionRequest) => MaybePromise<unknown>;
}

export interface InspectorEventActionRequest {
  readonly protocol: "relkit.events.admin";
  readonly version: typeof PROTOCOL_VERSION;
  readonly deliveryId: string;
  readonly reason?: string;
}

export interface InspectorEventActionService {
  readonly protocol?: string;
  readonly version?: number;
  readonly status?: (deliveryId: string) => MaybePromise<unknown>;
  readonly retry?: (request: InspectorEventActionRequest) => MaybePromise<unknown>;
  readonly cancel?: (request: InspectorEventActionRequest) => MaybePromise<unknown>;
}

export type InspectorToolApprovalState = "pending" | "approved" | "denied";

export interface InspectorToolApprovalRecord {
  readonly invocationId: string;
  readonly toolCallId: string;
  readonly toolId: string;
  readonly state: InspectorToolApprovalState;
  readonly sideEffect?: string;
  readonly policy?: string;
  readonly required?: boolean;
}

export interface InspectorToolApprovalRequest {
  readonly invocationId: string;
  readonly toolCallId: string;
  readonly toolId: string;
  readonly idempotencyKey: string;
}

export interface InspectorToolApprovalService {
  readonly get: (
    request: Omit<InspectorToolApprovalRequest, "idempotencyKey">,
  ) => MaybePromise<InspectorToolApprovalRecord | undefined>;
  readonly approve?: (request: InspectorToolApprovalRequest) => MaybePromise<unknown>;
  readonly deny?: (request: InspectorToolApprovalRequest) => MaybePromise<unknown>;
}

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

export interface InspectorActionServices {
  readonly functions?: InspectorFunctionActionService;
  readonly invokeFunction?: InspectorFunctionActionService["invoke"];
  readonly jobs?: InspectorJobActionService;
  readonly events?: InspectorEventActionService;
  readonly approvals?: InspectorToolApprovalService;
  readonly tools?: { readonly approvals?: InspectorToolApprovalService };
  readonly audit?: (record: InspectorAuditRecord) => MaybePromise<void>;
}

export interface InspectorActionEndpointOptions {
  readonly mode: InspectorMode;
  readonly enabled: boolean;
  readonly authorize: (request: Request) => MaybePromise<boolean>;
  readonly getGeneration: () => Promise<ResolvedActiveGeneration | undefined>;
}

export interface InspectorActionRequest {
  readonly action: InspectorActionName;
  readonly targetId: string;
  readonly generationId: string;
  readonly graphHash: string;
  readonly idempotencyKey: string;
  readonly body: Record<string, unknown>;
  readonly signal?: AbortSignal;
}

export const INSPECTOR_ACTION_PATHS = Object.freeze([
  `${API_BASE_PATH}/actions/functions/:id/invoke`,
  `${API_BASE_PATH}/actions/jobs/:id/retry`,
  `${API_BASE_PATH}/actions/jobs/:id/cancel`,
  `${API_BASE_PATH}/actions/events/:id/retry`,
  `${API_BASE_PATH}/actions/events/:id/cancel`,
  `${API_BASE_PATH}/actions/tools/:id/approval`,
  `${API_BASE_PATH}/actions/tools/:id/approve`,
  `${API_BASE_PATH}/actions/tools/:id/deny`,
] as const);

export function installInspectorActionEndpoints(
  app: Hono,
  options: InspectorActionEndpointOptions,
): void {
  if (!options.enabled) return;
  const idempotency = new Map<string, Promise<InspectorActionResult>>();
  const bind = (path: string, action: InspectorActionName, decision?: "approve" | "deny") =>
    app.post(path, async (context: Context) =>
      handle(context, action, decision, options, idempotency),
    );
  bind(INSPECTOR_ACTION_PATHS[0], "function.invoke");
  bind(INSPECTOR_ACTION_PATHS[1], "job.retry");
  bind(INSPECTOR_ACTION_PATHS[2], "job.cancel");
  bind(INSPECTOR_ACTION_PATHS[3], "event.retry");
  bind(INSPECTOR_ACTION_PATHS[4], "event.cancel");
  bind(INSPECTOR_ACTION_PATHS[5], "tool.approve");
  bind(INSPECTOR_ACTION_PATHS[6], "tool.approve", "approve");
  bind(INSPECTOR_ACTION_PATHS[7], "tool.deny", "deny");
}

async function handle(
  context: Context,
  action: InspectorActionName,
  decision: "approve" | "deny" | undefined,
  options: InspectorActionEndpointOptions,
  idempotency: Map<string, Promise<InspectorActionResult>>,
): Promise<Response> {
  if (!(await options.authorize(context.req.raw)))
    return json({ error: "RELKIT_INSPECTOR_UNAUTHORIZED" }, 401, { "www-authenticate": "Bearer" });
  try {
    negotiate(context.req.raw);
    const body = await readBody(context.req.raw);
    const request = parseInspectorAction(
      action,
      context.req.param("id"),
      body,
      context.req.raw.headers,
      context.req.raw.signal,
      decision,
    );
    const result = await executeInspectorAction(request, { ...options, idempotency });
    return json(result.body, result.status);
  } catch (error) {
    if (error instanceof InspectorActionError)
      return json(error.body ?? { error: error.code }, error.status);
    return errorResponse(error);
  }
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await request.json();
    if (value !== null && typeof value === "object" && !Array.isArray(value))
      return value as Record<string, unknown>;
  } catch {
    return {};
  }
  throw new InspectorActionError("RELKIT_INSPECTOR_ACTION_REQUEST_INVALID", 400);
}
