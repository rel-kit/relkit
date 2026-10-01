import type {
  RuntimeIntegrationRequirement,
  RuntimeIntegrationGraph,
} from "./runtime-integration-telemetry.types.js";
export type { RuntimeIntegrationRequirement } from "./runtime-integration-telemetry.types.js";
import { isStableId } from "@relkit/contracts";
import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";

/**
 * Collects runtime integration registrations required by telemetry exporters.
 * @param graph - Canonical normalized graph.
 * @param invalid - Expected metadata rejection callback preserving the original error.
 * @typeParam E - Expected rejection supplied by the owning planner.
 * @returns A lazy effect yielding required registrations or the supplied typed rejection.
 */
export const telemetryRequirementsEffect = Effect.fnUntraced(function* <E>(
  graph: RuntimeIntegrationGraph,
  invalid: (name: string, integrationId: string) => Effect.Effect<never, E>,
) {
  const application = graph.nodes.find((node) => node.kind === "app");
  const telemetry = record((application as Record<string, unknown> | undefined)?.telemetry);
  const exporters = record(telemetry?.exporters);
  if (exporters === undefined) return [];
  const requirements: RuntimeIntegrationRequirement[] = [];
  for (const [name, value] of Object.entries(exporters).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const exporter = record(value);
    const integrationId = exporter?.integrationId;
    if (
      exporter?.kind !== "telemetry-exporter" ||
      exporter.protocolVersion !== 1 ||
      !isStableId(integrationId) ||
      !isStableId(exporter.adapterId)
    )
      return yield* invalid(name, typeof integrationId === "string" ? integrationId : name);
    requirements.push({
      integrationId,
      capability: "telemetry",
      adapterId: exporter.adapterId,
      protocolVersion: 1,
    });
  }
  return requirements;
});

/**
 * Collects telemetry requirements at the synchronous compatibility boundary.
 * @param graph - Validated graph projection.
 * @param invalid - Legacy rejection callback.
 * @returns Required registrations in exporter-name order.
 * @throws The original error raised by the rejection callback.
 */
export function telemetryRequirements(
  graph: RuntimeIntegrationGraph,
  invalid: (name: string, integrationId: string) => never,
): RuntimeIntegrationRequirement[] {
  return runCompilerSync(
    telemetryRequirementsEffect(graph, (name, integrationId) =>
      Effect.sync(() => invalid(name, integrationId)),
    ),
  );
}

/**
 * Narrows nonarray metadata objects without coercing their values.
 * @param value - Declared metadata inspected without coercion.
 * @returns The nonarray record, or undefined without coercion.
 */
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
