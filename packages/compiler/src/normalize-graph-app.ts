import type { JsonValue } from "@relkit/contracts";
import type { DeploymentRoleProjection } from "@relkit/graph";
import { clean } from "./normalize-graph-utils.js";
import type { GraphNode, NormalizedDescriptor } from "./normalize-types.js";
import { isRecord } from "./normalize-utils.js";

export function environmentMetadata(value: unknown): JsonValue {
  return isRecord(value) && isRecord(value.metadata) ? clean(value.metadata) : {};
}

export function providerMaps(value: Record<string, unknown>): [string, unknown][] {
  return ["bucket", "cache", "job", "event", "model"].flatMap((capability) => {
    const normalized = value[capability];
    if (
      !isRecord(normalized) ||
      normalized.kind !== "normalized-provider-profiles" ||
      normalized.capability !== capability ||
      !isRecord(normalized.profiles)
    ) {
      return [];
    }
    return [[capability, normalized.profiles]];
  });
}

export function selectedProviderProfile(
  application: unknown,
  capability: string,
  requested?: string,
): string | undefined {
  if (!isRecord(application)) return requested;
  const profiles = new Map(providerMaps(application)).get(capability);
  if (!isRecord(profiles)) return requested;
  if (requested !== undefined) return profiles[requested] === undefined ? undefined : requested;
  const defaults = isRecord(application.defaults) ? application.defaults : {};
  const selected = defaults[capability];
  if (typeof selected === "string" && profiles[selected] !== undefined) return selected;
  const names = Object.keys(profiles);
  return names.length === 1 ? names[0] : undefined;
}

export function requestedProviderProfile(
  descriptorKind: string,
  value: Record<string, unknown>,
): string | undefined {
  const selected = descriptorKind === "agent" ? value.model : value.profile;
  return typeof selected === "string" ? selected.split(":", 1)[0] : undefined;
}

export function deploymentRoleProjections(value: unknown): readonly DeploymentRoleProjection[] {
  if (!isRecord(value)) return [];
  return (["engine", "host"] as const).flatMap((role) => {
    const selected = value[role];
    if (typeof selected === "string") {
      return [{ role, integrationId: selected, protocolVersion: 1 as const, configuration: {} }];
    }
    if (
      !isRecord(selected) ||
      selected.kind !== "deployment-integration" ||
      selected.role !== role ||
      typeof selected.integrationId !== "string" ||
      selected.protocolVersion !== 1
    ) {
      return [];
    }
    return [
      {
        role,
        integrationId: selected.integrationId,
        protocolVersion: 1 as const,
        configuration: clean(selected.configuration ?? {}),
      },
    ];
  });
}

export function environmentNodes(descriptor: NormalizedDescriptor): GraphNode[] {
  const value = isRecord(descriptor.value) ? descriptor.value : {};
  const env = isRecord(value.env) && isRecord(value.env.metadata) ? value.env.metadata : {};
  return Object.entries(env).map(([name, metadata]) => {
    const data = isRecord(metadata) ? metadata : {};
    return {
      kind: "env",
      id: name,
      source: descriptor.source,
      name,
      type: typeof data.type === "string" ? data.type : "",
      requiredIn: textList(data.requiredIn),
      hasDefault: data.hasDefault === true,
      sensitive: data.sensitive === true,
      ...(typeof data.description === "string" ? { description: data.description } : {}),
    };
  });
}

function textList(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}
