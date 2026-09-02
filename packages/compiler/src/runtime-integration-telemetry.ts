import { isStableId } from "@relkit/contracts";

export interface RuntimeIntegrationRequirement {
  readonly integrationId: string;
  readonly capability: string;
  readonly adapterId: string;
  readonly protocolVersion: number;
}

interface RuntimeIntegrationGraph {
  readonly nodes: readonly { readonly kind: string; readonly id: string }[];
}

export function telemetryRequirements(
  graph: RuntimeIntegrationGraph,
  invalid: (name: string, integrationId: string) => never,
): RuntimeIntegrationRequirement[] {
  const application = graph.nodes.find((node) => node.kind === "app");
  const telemetry = record((application as Record<string, unknown> | undefined)?.telemetry);
  const exporters = record(telemetry?.exporters);
  if (exporters === undefined) return [];
  return Object.entries(exporters)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => {
      const exporter = record(value);
      const integrationId = exporter?.integrationId;
      if (
        exporter?.kind !== "telemetry-exporter" ||
        exporter.protocolVersion !== 1 ||
        !isStableId(integrationId) ||
        !isStableId(exporter.adapterId)
      )
        return invalid(name, typeof integrationId === "string" ? integrationId : name);
      return {
        integrationId,
        capability: "telemetry",
        adapterId: exporter.adapterId,
        protocolVersion: 1,
      };
    });
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
