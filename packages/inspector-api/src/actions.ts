import type { InspectorActionName, InspectorActionEndpointOptions } from "./actions.types.js";
export type {
  InspectorActionName,
  InspectorFunctionActionRequest,
  InspectorFunctionActionService,
  InspectorJobActionRequest,
  InspectorJobActionService,
  InspectorEventActionRequest,
  InspectorEventActionService,
  InspectorToolApprovalState,
  InspectorToolApprovalRecord,
  InspectorToolApprovalRequest,
  InspectorToolApprovalService,
  InspectorAuditRecord,
  InspectorActionServices,
  InspectorActionEndpointOptions,
  InspectorActionRequest,
} from "./actions.types.js";
import { API_BASE_PATH } from "@relkit/contracts";
import { errorResponse, json, negotiate } from "./router-utils.js";
import { parseInspectorActionEffect } from "./actions-runtime.js";
import type { InspectorActionResult } from "./actions-runtime.js";
import { InspectorActionError } from "./actions-errors.js";
import type { Context, Hono } from "hono";
import { Effect, Layer, ManagedRuntime } from "effect";
import { runInspectorPromise as runExecutionPromise } from "./native-edge.js";
import { InspectorControls, inspectorControlsLayer } from "./controls.service.js";
import { inspectorLoggerLayer, registerInspectorOwner } from "./execution.js";

/** Established native action route paths used by the synchronous Hono installer. */
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

/**
 * Installs native Hono action edges backed by one scoped control owner.
 * @param app - Hono router receiving the synchronous route registrations.
 * @param options - Configured native authorities and ownership policy.
 * @param suppliedOwner - Optional reused router owner; absent owners are acquired once during installation.
 * @returns No value; the supplied or acquired owner is reused across requests.
 */
export function installInspectorActionEndpoints(
  app: Hono,
  options: InspectorActionEndpointOptions,
  suppliedOwner?: ManagedRuntime.ManagedRuntime<InspectorControls, never>,
): void {
  if (!options.enabled) return;
  const owner =
    suppliedOwner ??
    ManagedRuntime.make(Layer.mergeAll(inspectorControlsLayer, inspectorLoggerLayer()));
  registerInspectorOwner(app, owner);
  const idempotency = new Map<string, Promise<InspectorActionResult>>();
  const bind = (path: string, action: InspectorActionName, decision?: "approve" | "deny") =>
    app.post(path, async (context: Context) =>
      handle(context, action, decision, options, idempotency, owner),
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

/**
 * Authorizes a native action request before parsing or reading its active generation.
 * @param context - Native request context retained only for this ingress operation.
 * @param action - Declared operation selected by the route.
 * @param decision - Explicit approval decision from the declared route, when available.
 * @param options - Configured native authorities and ownership policy.
 * @param idempotency - Authoritative receipt map retained without expiration or capacity eviction.
 * @param owner - Reused service runtime supplied by the installing router.
 * @returns The existing JSON action envelope and HTTP status.
 */
async function handle(
  context: Context,
  action: InspectorActionName,
  decision: "approve" | "deny" | undefined,
  options: InspectorActionEndpointOptions,
  idempotency: Map<string, Promise<InspectorActionResult>>,
  owner: ManagedRuntime.ManagedRuntime<InspectorControls, never>,
): Promise<Response> {
  if (!(await options.authorize(context.req.raw)))
    return json({ error: "RELKIT_INSPECTOR_UNAUTHORIZED" }, 401, { "www-authenticate": "Bearer" });
  try {
    negotiate(context.req.raw);
    const body = await readBody(context.req.raw);
    const request = await runExecutionPromise(
      owner,
      parseInspectorActionEffect(
        action,
        context.req.param("id"),
        body,
        context.req.raw.headers,
        context.req.raw.signal,
        decision,
      ),
    );
    const result = await runExecutionPromise(
      owner,
      Effect.flatMap(InspectorControls, (service) =>
        service.execute(request, { ...options, idempotency }),
      ),
    );
    return json(result.body, result.status);
  } catch (error) {
    if (error instanceof InspectorActionError)
      return json(error.body ?? { error: error.code }, error.status);
    return errorResponse(error);
  }
}

/**
 * Reads the native request body once and validates the existing object-body contract.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @returns Parsed object fields or the existing invalid-body failure.
 */
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
