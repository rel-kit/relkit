import {
  InspectorJobsError,
  type InspectorJobsBinding,
  type InspectorJobsOperation,
  type InspectorJobsOperationContext,
  type InspectorJobsServices,
} from "./types.js";
import { isRecord, type ResolvedActiveGeneration } from "../shared.js";

/**
 * Requires configured native jobs authorities for an Inspector operation.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @returns The existing jobs service set or unavailable failure.
 */
export function jobsServices(generation: ResolvedActiveGeneration): InspectorJobsServices {
  const value: unknown = generation.jobs;
  if (!isRecord(value) || !("bindings" in value)) {
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_UNAVAILABLE", 503);
  }
  return value as unknown as InspectorJobsServices;
}

/**
 * Resolves configured native bindings without altering declaration order.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @returns The retained native binding sequence.
 */
export async function jobBindings(
  generation: ResolvedActiveGeneration,
): Promise<readonly InspectorJobsBinding[]> {
  const jobs = jobsServices(generation);
  try {
    const value = typeof jobs.bindings === "function" ? await jobs.bindings() : jobs.bindings;
    if (!Array.isArray(value)) throw new TypeError("jobs bindings are invalid");
    return value;
  } catch {
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_UNAVAILABLE", 503);
  }
}

/**
 * Checks native Inspector privilege before reading or controlling jobs.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @param operation - Declared read, control or schedule privilege category.
 * @param service - Optional service selector; ambiguous selections are rejected.
 * @returns The authorized native jobs authority or existing forbidden failure.
 */
export async function authorizeJobs(
  generation: ResolvedActiveGeneration,
  request: Request,
  operation: InspectorJobsOperation,
  service?: string,
): Promise<InspectorJobsServices> {
  const jobs = jobsServices(generation);
  if (jobs.authorize !== undefined) {
    let allowed = false;
    try {
      allowed = await jobs.authorize({
        operation,
        request,
        ...(service === undefined ? {} : { service }),
      });
    } catch {
      allowed = false;
    }
    if (!allowed) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_FORBIDDEN", 403);
  }
  return jobs;
}

/**
 * Constructs the existing native Inspector administration context and passes the HTTP signal.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param binding - Selected native job authority and its service identity.
 * @param operation - Declared read, control or schedule privilege category.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @param operationId - Caller-supplied native administration identity, when required.
 * @returns An identity-bearing native operation context.
 */
export function operationContext(
  generation: ResolvedActiveGeneration,
  binding: InspectorJobsBinding,
  operation: InspectorJobsOperation,
  request: Request,
  operationId?: string,
): InspectorJobsOperationContext {
  const graph = isRecord(generation.graph) ? generation.graph : {};
  return {
    operation,
    signal: request.signal,
    privilege: "inspector",
    application: typeof graph.appId === "string" ? graph.appId : "inspector",
    environment: typeof graph.environment === "string" ? graph.environment : "development",
    service: binding.service,
    serviceGeneration: binding.serviceGeneration,
    ...(operationId === undefined ? {} : { operationId }),
  };
}

/**
 * Projects supported native features and bounded limits without inventing capabilities.
 * @param binding - Selected native job authority and its service identity.
 * @returns The existing public capability declaration.
 */
export function bindingCapabilities(binding: InspectorJobsBinding): Record<string, unknown> {
  return {
    service: binding.service,
    serviceGeneration: binding.serviceGeneration,
    ...(binding.provider === undefined ? {} : { provider: binding.provider }),
    ...(binding.capabilities === undefined ? {} : { capabilities: binding.capabilities }),
  };
}
