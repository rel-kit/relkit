import {
  RUNTIME_INTEGRATION_PLAN_VERSION,
  type RuntimeIntegrationPlan,
  type RuntimeIntegrationPlanEntry,
} from "@relkit/contracts";
import type { RuntimeIntegrationPackage } from "./normalize-types.js";
import {
  telemetryRequirements,
  type RuntimeIntegrationRequirement,
} from "./runtime-integration-telemetry.js";

interface RuntimeIntegrationGraph {
  readonly nodes: readonly { readonly kind: string; readonly id: string }[];
  readonly edges: readonly { readonly kind: string; readonly to: string }[];
}

interface RuntimeProviderNode {
  readonly kind: "provider";
  readonly id: string;
  readonly capability: string;
  readonly adapter: {
    readonly integrationId: string;
    readonly adapterId: string;
    readonly protocolVersion: number;
  };
}

export class RuntimeIntegrationPlanError extends TypeError {
  readonly code: RuntimeIntegrationPlanErrorCode;
  readonly integrationId: string;

  constructor(code: RuntimeIntegrationPlanErrorCode, integrationId: string, message: string) {
    super(message);
    this.name = "RuntimeIntegrationPlanError";
    this.code = code;
    this.integrationId = integrationId;
  }
}

export type RuntimeIntegrationPlanErrorCode =
  | "RELKIT_RUNTIME_INTEGRATION_PACKAGE_MISSING"
  | "RELKIT_RUNTIME_INTEGRATION_IDENTITY_INVALID"
  | "RELKIT_RUNTIME_INTEGRATION_REGISTRATION_DUPLICATE";

export function generateRuntimeIntegrationPlan(
  graph: RuntimeIntegrationGraph,
  graphHash: string,
  packages: readonly RuntimeIntegrationPackage[] = [],
): RuntimeIntegrationPlan {
  const packageById = packageMap(packages);
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const required = new Set(
    graph.edges.filter((edge) => edge.kind === "uses-provider-profile").map((edge) => edge.to),
  );
  const providerRequirements = [...required]
    .map((id) => nodes.get(id))
    .filter(isProviderNode)
    .map((node) => ({
      integrationId: node.adapter.integrationId,
      capability: node.capability,
      adapterId: node.adapter.adapterId,
      protocolVersion: node.adapter.protocolVersion,
    }));
  const telemetry = telemetryRequirements(graph, (name, integrationId) => {
    throw new RuntimeIntegrationPlanError(
      "RELKIT_RUNTIME_INTEGRATION_IDENTITY_INVALID",
      integrationId,
      `Telemetry exporter "${name}" has invalid integration metadata.`,
    );
  });
  const entries = [...providerRequirements, ...telemetry].map((requirement) =>
    planEntry(requirement, packageById),
  );
  const integrations = [...new Map(entries.map((entry) => [entryKey(entry), entry])).values()].sort(
    (left, right) => entryKey(left).localeCompare(entryKey(right)),
  );
  assertUniqueRegistrations(integrations);
  return Object.freeze({
    version: RUNTIME_INTEGRATION_PLAN_VERSION,
    graphHash,
    integrations: Object.freeze(integrations.map((entry) => Object.freeze(entry))),
  });
}

function planEntry(
  requirement: RuntimeIntegrationRequirement,
  packages: ReadonlyMap<string, RuntimeIntegrationPackage>,
): RuntimeIntegrationPlanEntry {
  const selected = packages.get(requirement.integrationId);
  if (selected === undefined)
    throw new RuntimeIntegrationPlanError(
      "RELKIT_RUNTIME_INTEGRATION_PACKAGE_MISSING",
      requirement.integrationId,
      `Runtime integration package metadata is missing for "${requirement.integrationId}".`,
    );
  const matches = selected.registrations.some(
    (entry) =>
      entry.capability === requirement.capability &&
      entry.adapterId === requirement.adapterId &&
      entry.protocolVersion === requirement.protocolVersion,
  );
  if (!matches)
    throw new RuntimeIntegrationPlanError(
      "RELKIT_RUNTIME_INTEGRATION_IDENTITY_INVALID",
      requirement.integrationId,
      `Package "${selected.packageName}" does not register ${requirement.capability}:${requirement.adapterId} protocol ${requirement.protocolVersion}.`,
    );
  return {
    ...requirement,
    packageName: selected.packageName,
    packageVersion: selected.packageVersion,
    exportName: selected.exportName,
  };
}

function packageMap(
  packages: readonly RuntimeIntegrationPackage[],
): ReadonlyMap<string, RuntimeIntegrationPackage> {
  const result = new Map<string, RuntimeIntegrationPackage>();
  for (const entry of packages) {
    const existing = result.get(entry.integrationId);
    if (existing !== undefined && packageKey(existing) !== packageKey(entry))
      throw new RuntimeIntegrationPlanError(
        "RELKIT_RUNTIME_INTEGRATION_IDENTITY_INVALID",
        entry.integrationId,
        `Integration ID "${entry.integrationId}" is owned by multiple packages.`,
      );
    result.set(entry.integrationId, entry);
  }
  return result;
}

function assertUniqueRegistrations(entries: readonly RuntimeIntegrationPlanEntry[]): void {
  const owners = new Map<string, RuntimeIntegrationPlanEntry>();
  for (const entry of entries) {
    const key = `${entry.capability}\0${entry.adapterId}`;
    const existing = owners.get(key);
    if (existing !== undefined)
      throw new RuntimeIntegrationPlanError(
        "RELKIT_RUNTIME_INTEGRATION_REGISTRATION_DUPLICATE",
        entry.integrationId,
        `Runtime registration ${entry.capability}:${entry.adapterId} is provided by both "${existing.integrationId}" and "${entry.integrationId}".`,
      );
    owners.set(key, entry);
  }
}

function packageKey(entry: RuntimeIntegrationPackage): string {
  return JSON.stringify(entry);
}

function isProviderNode(
  node: RuntimeIntegrationGraph["nodes"][number] | undefined,
): node is RuntimeProviderNode {
  if (node?.kind !== "provider") return false;
  const value = node as unknown as Record<string, unknown>;
  const adapter = value.adapter as Record<string, unknown> | undefined;
  return (
    typeof value.capability === "string" &&
    adapter !== undefined &&
    typeof adapter.integrationId === "string" &&
    typeof adapter.adapterId === "string" &&
    typeof adapter.protocolVersion === "number"
  );
}

function entryKey(entry: RuntimeIntegrationPlanEntry): string {
  return [
    entry.capability,
    entry.adapterId,
    entry.integrationId,
    entry.protocolVersion,
    entry.packageName,
    entry.packageVersion,
    entry.exportName,
  ].join("\0");
}
