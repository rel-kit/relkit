import type { JsonValue } from "@relkit/contracts";
import { selectedProviderProfile } from "./normalize-graph-app.js";
import { clean } from "./normalize-graph-utils.js";
import type { NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";
import { isRecord } from "./normalize-utils.js";

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

function channelClient(value: unknown): "internal" | "public" | "protected" {
  if (!isRecord(value)) return "internal";
  return value.public === true ? "public" : "protected";
}

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
