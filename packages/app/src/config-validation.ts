import { isEnvRef, type EnvDefinition, type EnvShape } from "@zsys/config";
import { normalizeId } from "@zsys/contracts";
import type { ConfigProviderMaps } from "./config-types.js";
import { copyProviderTopology, type ProviderTopology } from "./providers.js";

const MAPS = ["buckets", "caches", "jobs", "events", "models", "observability"] as const;
const DEFAULTS = {
  buckets: "bucket",
  caches: "cache",
  jobs: "job",
  events: "event",
  models: "model",
  observability: "observability",
} as const;

export function copyProviderMaps(value: ConfigProviderMaps): ConfigProviderMaps {
  const topology = providerTopology(value);
  return {
    ...(topology.buckets === undefined ? {} : { buckets: topology.buckets }),
    ...(topology.cache === undefined ? {} : { caches: topology.cache }),
    ...(topology.jobs === undefined ? {} : { jobs: topology.jobs }),
    ...(topology.events === undefined ? {} : { events: topology.events }),
    ...(topology.models === undefined ? {} : { models: topology.models }),
    ...(topology.observability === undefined ? {} : { observability: topology.observability }),
  };
}

export function providerTopology(value: ConfigProviderMaps): ProviderTopology {
  return copyProviderTopology({
    ...(value.buckets === undefined ? {} : { buckets: value.buckets }),
    ...(value.caches === undefined ? {} : { cache: value.caches }),
    ...(value.jobs === undefined ? {} : { jobs: value.jobs }),
    ...(value.events === undefined ? {} : { events: value.events }),
    ...(value.models === undefined ? {} : { models: value.models }),
    ...(value.observability === undefined ? {} : { observability: value.observability }),
  });
}

export function validateDefaults(
  maps: ConfigProviderMaps,
  defaults: Readonly<Record<string, unknown>> | undefined,
): void {
  for (const mapName of MAPS) {
    const profiles = maps[mapName];
    const defaultName = DEFAULTS[mapName];
    const selected = defaults?.[defaultName];
    if (
      selected !== undefined &&
      (typeof selected !== "string" || profiles?.[selected] === undefined)
    ) {
      throw new TypeError(`defaults.${defaultName} must reference a ${mapName} profile`);
    }
  }
  for (const key of Object.keys(defaults ?? {})) {
    if (!(Object.values(DEFAULTS) as readonly string[]).includes(key)) {
      throw new TypeError(`Unknown default capability "${key}"`);
    }
  }
}

export function resolveDefaults(
  maps: ConfigProviderMaps,
  defaults: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, string>> {
  validateDefaults(maps, defaults);
  const resolved: Record<string, string> = {};
  for (const mapName of MAPS) {
    const selected = defaults?.[DEFAULTS[mapName]];
    const profiles = Object.keys(maps[mapName] ?? {});
    if (typeof selected === "string") resolved[DEFAULTS[mapName]] = selected;
    else if (profiles.length === 1) resolved[DEFAULTS[mapName]] = profiles[0]!;
  }
  return Object.freeze(resolved);
}

export function isEnvDefinition(value: unknown): value is EnvDefinition<EnvShape> {
  if (!isRecord(value) || value.kind !== "env-definition" || !isRecord(value.shape)) return false;
  return Object.entries(value.shape).every(([name, builder]) => {
    const reference = value[name];
    return (
      isRecord(builder) &&
      builder.kind === "env-builder" &&
      typeof builder.parse === "function" &&
      typeof builder.getDefault === "function" &&
      isEnvRef(reference) &&
      reference.name === name
    );
  });
}

export function deriveApplicationId(packageName: string): string {
  const normalized = packageName.startsWith("@") ? packageName.slice(1) : packageName;
  return normalizeId(normalized.replaceAll("/", "."));
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
