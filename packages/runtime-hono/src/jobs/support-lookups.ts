import type { JobsRuntime } from "@relkit/jobs";
import type { RouteMaterializationOptions } from "../materialize-routes.js";

/** Read a manifest entry from either a map or record.
 * @param entries - Job manifest descriptors indexed by job or graph node ID.
 * @param key - Job or graph node ID to resolve.
 * @returns The entry, or undefined when absent.
 */
export function mapEntry(
  entries: RouteMaterializationOptions["manifest"]["jobs"],
  key: string,
): unknown {
  if (entries === undefined) return undefined;
  if (typeof (entries as ReadonlyMap<string, unknown>).get === "function") {
    return (entries as ReadonlyMap<string, unknown>).get(key);
  }
  return (entries as Readonly<Record<string, unknown>>)[key];
}

/** Read a profile runtime from a map or record.
 * @param source - Resolved singleton runtime or profile-indexed runtime collection.
 * @param key - Provider profile name to resolve.
 * @returns The matching runtime, excluding an already-resolved singleton.
 */
export function runtimeEntry(
  source:
    | JobsRuntime
    | ReadonlyMap<string, JobsRuntime>
    | Readonly<Record<string, JobsRuntime>>
    | undefined,
  key: string,
): JobsRuntime | undefined {
  if (source === undefined || isJobsRuntime(source)) return undefined;
  if (typeof (source as ReadonlyMap<string, JobsRuntime>).get === "function") {
    return (source as ReadonlyMap<string, JobsRuntime>).get(key);
  }
  return (source as Readonly<Record<string, JobsRuntime>>)[key];
}

/** Recognize a runtime by its adapter and scope fields.
 * @param value - Value to validate or project.
 * @returns Whether the value has the runtime's required structural markers.
 */
export function isJobsRuntime(value: unknown): value is JobsRuntime {
  return value !== null && typeof value === "object" && "adapter" in value && "scope" in value;
}
