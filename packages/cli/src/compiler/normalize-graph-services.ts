import { clean } from "./normalize-graph-utils.js";
import { isRecord, refId } from "./normalize-utils.js";
import type { NormalizationWork, NormalizedDescriptor } from "./normalize-types.js";

/**
 * Projects public members and specialized capability metadata for a service.
 * @param value - Declared metadata inspected without coercion.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Serializable public member and specialized capability metadata.
 */
export function serviceNodeData(
  value: Record<string, unknown>,
  descriptor: NormalizedDescriptor,
  work: NormalizationWork,
): Record<string, unknown> {
  const entries = serviceEntries(value, descriptor);
  const functions = entries.flatMap(([name, target]) =>
    isRecord(target) && target.ref?.kind === "function" && refId(target) !== undefined
      ? [{ name, functionId: refId(target)! }]
      : [],
  );
  const events = entries.flatMap(([name, target]) =>
    isRecord(target) && target.ref?.kind === "event" && refId(target) !== undefined
      ? [{ name, eventId: refId(target)! }]
      : [],
  );
  const tasks = entries.flatMap(([name, target]) =>
    isRecord(target) && target.ref?.kind === "task" && refId(target) !== undefined
      ? [{ name, taskId: refId(target)! }]
      : [],
  );
  const jobs = entries.flatMap(([name, target]) =>
    isRecord(target) && target.ref?.kind === "job" && refId(target) !== undefined
      ? [{ name, jobId: refId(target)! }]
      : [],
  );
  return {
    ...(typeof value.title === "string" ? { title: value.title } : {}),
    ...(typeof value.description === "string" ? { description: value.description } : {}),
    ...(Array.isArray(value.tags) ? { tags: clean(value.tags) } : {}),
    functions,
    events,
    ...(tasks.length === 0 ? {} : { tasks }),
    ...(jobs.length === 0 ? {} : { jobs }),
    ...(isRecord(value.capability)
      ? { capability: capability(value.capability, descriptor.id, work) }
      : {}),
  };
}

/**
 * Selects service member entries with stable function identities.
 * @param value - Declared metadata inspected without coercion.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @returns Service names paired with their stable public function members.
 */
export function serviceEntries(
  value: Record<string, unknown>,
  descriptor: NormalizedDescriptor,
): readonly [string, unknown][] {
  const positions = new Map(
    (descriptor.facts?.serviceMembers ?? []).map(({ member, position }) => [member, position]),
  );
  return Object.entries(value).sort(
    ([left], [right]) =>
      (positions.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (positions.get(right) ?? Number.MAX_SAFE_INTEGER) || left.localeCompare(right),
  );
}

/**
 * Projects graph-visible specialized service capability metadata.
 * @param value - Declared metadata inspected without coercion.
 * @param serviceId - Stable identity of the service owning these graph members.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Serializable specialized service capability metadata.
 */
function capability(
  value: Record<string, unknown>,
  serviceId: string,
  work: NormalizationWork,
): unknown {
  if (value.kind !== "better-auth") return clean(value);
  const mount = work.descriptors.find((descriptor) => {
    if (descriptor.kind !== "route" || !isRecord(descriptor.value)) return false;
    return isRecord(descriptor.value.auth) && refId(descriptor.value.auth.service) === serviceId;
  });
  const route = mount !== undefined && isRecord(mount.value) ? mount.value : {};
  const path = typeof route.path === "string" ? route.path : "";
  const database = work.descriptors.find(
    (descriptor) => isRecord(descriptor.value) && descriptor.value.capability?.kind === "drizzle",
  );
  return {
    kind: "better-auth",
    basePath: path.replace(/\/\*[^/]+\??$/, "") || "/",
    databaseServiceId: database?.id ?? "",
  };
}
