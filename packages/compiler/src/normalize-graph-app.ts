import type { JsonValue } from "@relkit/contracts";
import { clean } from "./normalize-graph-utils.js";
import type { GraphNode, NormalizedDescriptor } from "./normalize-types.js";
import { isRecord } from "./normalize-utils.js";

export function environmentMetadata(value: unknown): JsonValue {
  return isRecord(value) && isRecord(value.metadata) ? clean(value.metadata) : {};
}

export function providerBindingIds(value: unknown): readonly string[] {
  if (!isRecord(value)) return [];
  return providerMaps(value)
    .flatMap(([capability, profiles]) =>
      isRecord(profiles)
        ? Object.keys(profiles).map((profile) => `provider.${capability}.${profile}`)
        : [],
    )
    .sort();
}

export function providerMaps(value: Record<string, unknown>): [string, unknown][] {
  return [
    ["buckets", value.buckets],
    ["cache", value.caches],
    ["jobs", value.jobs],
    ["events", value.events],
    ["models", value.models],
    ["observability", value.observability],
  ].filter((entry): entry is [string, unknown] => entry[1] !== undefined);
}

const PROVIDER_DEFAULT_KEYS: Readonly<Record<string, string>> = Object.freeze({
  buckets: "bucket",
  cache: "cache",
  jobs: "job",
  events: "event",
  models: "model",
  observability: "observability",
});

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
  const selected = defaults[PROVIDER_DEFAULT_KEYS[capability] ?? ""];
  if (typeof selected === "string" && profiles[selected] !== undefined) return selected;
  const names = Object.keys(profiles);
  return names.length === 1 ? names[0] : undefined;
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
