import type { GraphNode, NormalizedDescriptor } from "./normalize-types.js";
import { isRecord } from "./normalize-utils.js";

export function providerNodes(descriptor: NormalizedDescriptor): GraphNode[] {
  const value = isRecord(descriptor.value) ? descriptor.value : {};
  const providers = isRecord(value.providers) ? value.providers : {};
  return Object.entries(providers)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([capability, profiles]) => {
      if (!isRecord(profiles)) return [];
      return Object.entries(profiles)
        .sort(([left], [right]) => left.localeCompare(right))
        .flatMap(([profile, candidate]) => {
          const binding = isRecord(candidate) ? candidate : {};
          const adapter = isRecord(binding.adapter) ? binding.adapter : {};
          if (typeof adapter.adapter !== "string") return [];
          return [
            {
              kind: "provider",
              id: providerBindingId(capability, profile),
              source: descriptor.source,
              capability,
              profile,
              adapter: adapter.adapter,
              ownership: binding.ownership === "managed" ? "managed" : "external",
              configuration: projectConfiguration(adapter.configuration),
              environment: projectEnvironment(adapter.environment),
            },
          ];
        });
    });
}

export function providerBindingId(capability: string, profile: string): string {
  return `provider.${capability}.${profile}`;
}

function projectConfiguration(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(projectConfiguration);
  if (!isRecord(value)) return value ?? null;
  if (value.kind === "env-ref") {
    return {
      kind: "env-ref",
      name: typeof value.name === "string" ? value.name : "",
      type: typeof value.type === "string" ? value.type : "",
      sensitive: value.sensitive === true,
    };
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, projectConfiguration(child)]),
  );
}

function projectEnvironment(value: unknown): readonly {
  name: string;
  type: string;
  sensitive: boolean;
}[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.name !== "string" || typeof entry.type !== "string") {
      return [];
    }
    return [{ name: entry.name, type: entry.type, sensitive: entry.sensitive === true }];
  });
}
