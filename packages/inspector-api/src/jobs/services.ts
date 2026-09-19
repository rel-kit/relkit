import { InspectorJobsError, type InspectorJobsBinding, type InspectorJobsOperation, type InspectorJobsOperationContext, type InspectorJobsServices } from "./types.js";
import { isRecord, type ResolvedActiveGeneration } from "../shared.js";

export function jobsServices(generation: ResolvedActiveGeneration): InspectorJobsServices {
  const value: unknown = generation.jobs;
  if (!isRecord(value) || !("bindings" in value)) {
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_UNAVAILABLE", 503);
  }
  return value as unknown as InspectorJobsServices;
}

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
      allowed = await jobs.authorize({ operation, request, ...(service === undefined ? {} : { service }) });
    } catch {
      allowed = false;
    }
    if (!allowed) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_FORBIDDEN", 403);
  }
  return jobs;
}

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

export function bindingCapabilities(binding: InspectorJobsBinding): Record<string, unknown> {
  return {
    service: binding.service,
    serviceGeneration: binding.serviceGeneration,
    ...(binding.provider === undefined ? {} : { provider: binding.provider }),
    ...(binding.capabilities === undefined ? {} : { capabilities: binding.capabilities }),
  };
}
