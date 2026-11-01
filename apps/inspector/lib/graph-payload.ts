/** Reads the `/graph` payload, which nests nodes and edges under `graph`; older payloads keep them at the root. */
import type { InspectorGraph, InspectorObject } from "./api-types";

export function graphPart(
  payload: InspectorGraph,
  key: "nodes" | "edges",
): readonly InspectorObject[] {
  const value = payload.graph?.[key] ?? payload[key];
  return Array.isArray(value)
    ? value.filter(
        (item): item is InspectorObject =>
          item !== null && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}
