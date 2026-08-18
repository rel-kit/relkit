import type { GraphNode, NormalizedDescriptor } from "./normalize-types.js";
import { isRecord } from "./normalize-utils.js";

export function providerNodes(descriptor: NormalizedDescriptor): GraphNode[] {
  const value = isRecord(descriptor.value) ? descriptor.value : {};
  const providers = isRecord(value.providers) ? value.providers : {};
  const profiles = new Map<
    string,
    {
      capabilities: Set<string>;
      configuration: Map<string, Set<string>>;
      environment: Set<string>;
    }
  >();
  for (const [environment, provider] of Object.entries(providers).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const metadata =
      isRecord(provider) && isRecord(provider.metadata) ? provider.metadata : undefined;
    if (metadata === undefined) continue;
    const profileMap = isRecord(metadata.profiles) ? metadata.profiles : {};
    const names = Object.keys(profileMap).length > 0 ? Object.keys(profileMap) : ["default"];
    for (const name of names) {
      const current = profiles.get(name) ?? {
        capabilities: new Set<string>(),
        configuration: new Map<string, Set<string>>(),
        environment: new Set<string>(),
      };
      const capabilities = Array.isArray(profileMap[name])
        ? profileMap[name]
        : metadata.capabilities;
      if (Array.isArray(capabilities)) {
        capabilities.forEach((capability) => {
          if (typeof capability === "string") current.capabilities.add(capability);
        });
      }
      const environmentMetadata = Array.isArray(metadata.environment) ? metadata.environment : [];
      environmentMetadata.forEach((entry) => {
        if (isRecord(entry) && typeof entry.name === "string") current.environment.add(entry.name);
      });
      current.configuration.set(environment, new Set(configurationNames(metadata.configuration)));
      profiles.set(name, current);
    }
  }
  return [...profiles.entries()].map(([profile, value]) => ({
    kind: "provider",
    id: profile,
    source: descriptor.source,
    profile,
    capabilities: [...value.capabilities].sort(),
    configuration: Object.fromEntries(
      [...value.configuration.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([environment, names]) => [environment, [...names].sort()]),
    ),
    environment: [...value.environment].sort(),
  }));
}

/** Keeps provider configuration names while dropping every configured value. */
function configurationNames(value: unknown): readonly string[] {
  const names = new Set<string>();
  collectConfigurationNames(value, "", names);
  return [...names].sort();
}

function collectConfigurationNames(value: unknown, path: string, names: Set<string>): void {
  if (!isRecord(value) || isValueMarker(value)) {
    if (path !== "") {
      names.add(path);
    }
    return;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) {
    if (path !== "") names.add(path);
    return;
  }
  for (const [key, child] of entries) {
    const next = path === "" ? key : `${path}.${key}`;
    if (isRecord(child) && !isValueMarker(child) && key !== "client") {
      collectConfigurationNames(child, next, names);
    } else {
      names.add(next);
    }
  }
}

function isValueMarker(value: Record<string, unknown>): boolean {
  return value.kind === "env-ref" || value.kind === "sensitive-configuration";
}
