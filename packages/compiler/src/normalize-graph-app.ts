import type { JsonValue } from "@zsys/contracts";
import { clean } from "./normalize-graph-utils.js";
import type { GraphNode, NormalizedDescriptor } from "./normalize-types.js";
import { isRecord } from "./normalize-utils.js";

export function environmentMetadata(value: unknown): JsonValue {
  return isRecord(value) && isRecord(value.metadata) ? clean(value.metadata) : {};
}

export function providerBindingIds(value: unknown): readonly string[] {
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .flatMap(([capability, profiles]) =>
      isRecord(profiles)
        ? Object.keys(profiles).map((profile) => `provider.${capability}.${profile}`)
        : [],
    )
    .sort();
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
