import type { JsonValue } from "@relkit/contracts";
import { authorizeJobs, bindingCapabilities, jobBindings } from "./services.js";
import { identity, safeJson, type ResolvedActiveGeneration } from "../shared.js";

export async function listJobServices(
  generation: ResolvedActiveGeneration,
  request: Request,
): Promise<JsonValue> {
  await authorizeJobs(generation, request, "read");
  const bindings = await jobBindings(generation);
  const items = await Promise.all(bindings.map(async (binding) => {
    try {
      const health = binding.health === undefined ? { state: "unknown" } : await binding.health();
      const value = safeJson({ ...bindingCapabilities(binding), health });
      return isRecord(value) ? { ...value, service: binding.service, serviceGeneration: binding.serviceGeneration } as JsonValue : value;
    } catch {
      return { ...bindingCapabilities(binding), health: { state: "unavailable" } } as JsonValue;
    }
  }));
  return safeJson({ ...identity(generation), items });
}

export async function getJobService(
  generation: ResolvedActiveGeneration,
  request: Request,
  service: string,
): Promise<JsonValue> {
  await authorizeJobs(generation, request, "read", service);
  const binding = (await jobBindings(generation)).find((value) => value.service === service);
  if (binding === undefined) return safeJson({ ...identity(generation), service, state: "unavailable" });
  try {
    const health = binding.health === undefined ? { state: "unknown" } : await binding.health();
    const value = safeJson({ ...identity(generation), ...bindingCapabilities(binding), health });
    return isRecord(value) ? { ...value, service: binding.service, serviceGeneration: binding.serviceGeneration } as JsonValue : value;
  } catch {
    return { ...identity(generation), ...bindingCapabilities(binding), health: { state: "unavailable" } } as JsonValue;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
