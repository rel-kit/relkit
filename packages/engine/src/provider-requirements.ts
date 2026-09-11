import type { GraphNode, ProviderBindingNode } from "@relkit/graph";

export type ExpectedProvider = Pick<ProviderBindingNode, "capability" | "profile">;

export function isProviderNode(value: GraphNode | undefined): value is ProviderBindingNode {
  return value?.kind === "provider";
}

export function expectedProviders(value: GraphNode | undefined): readonly ExpectedProvider[] {
  if (value === undefined) return [];
  if (
    value.kind === "bucket" ||
    value.kind === "cache" ||
    value.kind === "job" ||
    value.kind === "event"
  ) {
    return [{ capability: value.kind, profile: value.profile }];
  }
  if (value.kind === "channel") return [{ capability: "realtime", profile: value.profile }];
  if (value.kind === "agent") {
    const providers: ExpectedProvider[] =
      value.execution === "graph" || value.modelSource === "native"
        ? []
        : [{ capability: "model", profile: value.profile }];
    if (value.stateProfile !== undefined)
      providers.push({ capability: "agent-state", profile: value.stateProfile });
    return providers;
  }
  if (value.kind !== "trigger" || value.triggerType !== "event") return [];
  const config = record(value.config);
  return [
    {
      capability: "event",
      profile: typeof config?.profile === "string" ? config.profile : "default",
    },
  ];
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}
