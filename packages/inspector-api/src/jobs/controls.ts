import type { JsonValue } from "@relkit/contracts";
import { authorizeJobs, jobBindings, operationContext } from "./services.js";
import { InspectorJobsError, type InspectorJobsBinding } from "./types.js";
import { identity, safeJson, type ResolvedActiveGeneration } from "../shared.js";

export async function controlJobRun(
  generation: ResolvedActiveGeneration,
  request: Request,
  runId: string,
  action: "cancel" | "retry",
): Promise<JsonValue> {
  const body = await readBody(request);
  const service =
    new URL(request.url).searchParams.get("service") ??
    (typeof body.service === "string" ? body.service : undefined);
  await authorizeJobs(generation, request, "control", service);
  const binding = await findBinding(generation, request, runId, service);
  if (service === undefined) await authorizeJobs(generation, request, "control", binding.service);
  const operationId =
    request.headers.get("x-relkit-operation-id") ??
    (typeof body.operationId === "string" ? body.operationId : crypto.randomUUID());
  if (operationId.length === 0 || operationId.length > 256)
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_OPERATION_INVALID", 400);
  const context = operationContext(generation, binding, "control", request);
  try {
    if (action === "cancel") {
      if (binding.cancel === undefined || binding.capabilities?.features?.cancel === false)
        throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_OPERATION_UNSUPPORTED", 501);
      const reason = typeof body.reason === "string" ? body.reason : undefined;
      return controlResponse(
        generation,
        binding,
        await binding.cancel(runId, operationId, reason, context),
      );
    }
    if (binding.retry === undefined || binding.capabilities?.features?.retry === false)
      throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_OPERATION_UNSUPPORTED", 501);
    return controlResponse(generation, binding, await binding.retry(runId, operationId, context));
  } catch (error) {
    if (error instanceof InspectorJobsError) throw error;
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_OPERATION_INVALID", 409);
  }
}

function controlResponse(
  generation: ResolvedActiveGeneration,
  binding: InspectorJobsBinding,
  receipt: unknown,
): JsonValue {
  const value = safeJson({ ...identity(generation), receipt });
  return isRecord(value)
    ? ({
        ...value,
        service: binding.service,
        serviceGeneration: binding.serviceGeneration,
      } as JsonValue)
    : value;
}

async function findBinding(
  generation: ResolvedActiveGeneration,
  request: Request,
  runId: string,
  service: string | undefined,
): Promise<InspectorJobsBinding> {
  const bindings = (await jobBindings(generation)).filter(
    (binding) => service === undefined || binding.service === service,
  );
  if (bindings.length === 0) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_UNAVAILABLE", 503);
  for (const binding of bindings) {
    try {
      await binding.get(runId, operationContext(generation, binding, "read", request));
      return binding;
    } catch {}
  }
  throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_NOT_FOUND", 404);
}

async function readBody(request: Request): Promise<Record<string, JsonValue>> {
  try {
    const value: unknown = await request.json();
    if (value !== null && typeof value === "object" && !Array.isArray(value))
      return value as Record<string, JsonValue>;
  } catch {}
  return {};
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
