import { clean } from "./normalize-graph-utils.js";
import { isRecord, refId } from "./normalize-utils.js";
import type { NormalizationWork, NormalizedDescriptor } from "./normalize-types.js";

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
  return {
    ...(typeof value.title === "string" ? { title: value.title } : {}),
    ...(typeof value.description === "string" ? { description: value.description } : {}),
    ...(Array.isArray(value.tags) ? { tags: clean(value.tags) } : {}),
    functions,
    events,
    ...(isRecord(value.capability)
      ? { capability: capability(value.capability, descriptor.id, work) }
      : {}),
  };
}

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
