import type { JsonValue } from "@relkit/contracts";
import { selectedProviderProfile } from "./normalize-graph-app.js";
import { clean } from "./normalize-graph-utils.js";
import type { NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";
import { isRecord } from "./normalize-utils.js";

/**
 * Projects event, presence, client, and provider contracts for a channel.
 * @param value - Declared metadata inspected without coercion.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param application - Application descriptor metadata.
 * @returns Serializable channel event, presence, client, and provider metadata.
 */
export function channelNodeData(
  value: Record<string, unknown>,
  descriptor: NormalizedDescriptor,
  work: NormalizationWork,
  application: unknown,
) {
  const client = channelClient(value.client);
  const replay = value.replay === undefined ? undefined : clean(value.replay);
  const presence = channelPresence(work, descriptor, value.presence);
  return {
    params: work.schemas.get(`${descriptor.id}:params`) ?? null,
    events: channelEvents(work, descriptor, value.events),
    profile:
      selectedProviderProfile(
        application,
        "realtime",
        typeof value.profile === "string" ? value.profile : undefined,
      ) ?? "default",
    ...(client === undefined ? {} : { client }),
    ...(replay === undefined ? {} : { replay }),
    ...(presence === undefined ? {} : { presence }),
  };
}

/**
 * Projects declared channel event schemas from the compiler index.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @param value - Declared metadata inspected without coercion.
 * @returns Declared channel events mapped to their projected schemas.
 */
function channelEvents(
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
  value: unknown,
): Readonly<Record<string, JsonValue>> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((event) => [event, work.schemas.get(`${descriptor.id}:event:${event}`) ?? null]),
  );
}

/**
 * Classifies internal, public, or protected channel exposure.
 * @param value - Declared metadata inspected without coercion.
 * @returns The channel's internal, public, or protected exposure.
 */
function channelClient(value: unknown): "internal" | "public" | "protected" {
  if (!isRecord(value)) return "internal";
  return value.public === true ? "public" : "protected";
}

/**
 * Projects a channel's declared presence schema.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @param value - Declared metadata inspected without coercion.
 * @returns The projected presence schema, or undefined.
 */
function channelPresence(
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
  value: unknown,
): JsonValue | undefined {
  if (value === "count") return "count";
  if (!isRecord(value)) return undefined;
  return {
    member: work.schemas.get(`${descriptor.id}:presence:member`) ?? null,
    maxMembers: typeof value.maxMembers === "number" ? value.maxMembers : 0,
  };
}
