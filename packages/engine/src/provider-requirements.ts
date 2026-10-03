import type { GraphNode, ProviderBindingNode } from "@relkit/graph";
import type { ExpectedProvider } from "./provider-requirements.types.js";
export type { ExpectedProvider } from "./provider-requirements.types.js";

/** Recognize graph provider binding metadata without acquiring resources.
 * @returns Whether the graph node is provider-binding metadata.
 * @param value - Native value being validated or projected.
 */
export function isProviderNode(value: GraphNode | undefined): value is ProviderBindingNode {
  return value?.kind === "provider";
}

/** Infer required provider capability/profile pairs from a logical graph node.
 * @returns Required capability/profile pairs for the logical resource.
 * @param value - Native value being validated or projected.
 */
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

/** Read a native record without coercing primitives.
 * @returns read a native record without coercing primitives.
 * @param value - Native value being validated or projected.
 */
function record(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}
