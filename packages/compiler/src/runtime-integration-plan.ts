import {
  RuntimeIntegrationPlanError,
  RuntimeIntegrationPlanFailure,
} from "./runtime-integration-errors.js";
import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import type {
  RuntimeIntegrationGraph,
  RuntimeProviderNode,
  RuntimeIntegrationPlanErrorCode,
} from "./runtime-integration-plan.types.js";
export type { RuntimeIntegrationPlanErrorCode } from "./runtime-integration-plan.types.js";
import {
  RUNTIME_INTEGRATION_PLAN_VERSION,
  type RuntimeIntegrationPlan,
  type RuntimeIntegrationPlanEntry,
} from "@relkit/contracts";
import type { RuntimeIntegrationPackage } from "./normalize-types.js";
import {
  telemetryRequirementsEffect,
  type RuntimeIntegrationRequirement,
} from "./runtime-integration-telemetry.js";

/**
 * Resolves required provider and telemetry registrations to their owning packages.
 * @param graph - Canonical normalized graph.
 * @param graphHash - Hash identifying the accepted graph.
 * @param packages - Runtime integration packages declared by authoring imports.
 * @returns A lazy effect that resolves required provider and telemetry registrations to their owning packages; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const generateRuntimeIntegrationPlanEffect = Effect.fn(
  "Compiler.generateRuntimeIntegrationPlan",
)(
  function* (
    graph: RuntimeIntegrationGraph,
    graphHash: string,
    packages: readonly RuntimeIntegrationPackage[] = [],
  ) {
    const packageById = yield* packageMapEffect(packages);
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
    const telemetry = yield* telemetryRequirementsEffect(graph, (name, integrationId) =>
      Effect.fail(
        new RuntimeIntegrationPlanFailure({
          cause: new RuntimeIntegrationPlanError(
            "RELKIT_RUNTIME_INTEGRATION_IDENTITY_INVALID",
            integrationId,
            `Telemetry exporter "${name}" has invalid integration metadata.`,
          ),
        }),
      ),
    );
    const entries = yield* Effect.forEach([...providerRequirements, ...telemetry], (requirement) =>
      planEntryEffect(requirement, packageById),
    );
    const integrations = [
      ...new Map(entries.map((entry) => [entryKey(entry), entry])).values(),
    ].sort((left, right) => entryKey(left).localeCompare(entryKey(right)));
    yield* assertUniqueRegistrationsEffect(integrations);
    return Object.freeze({
      version: RUNTIME_INTEGRATION_PLAN_VERSION,
      graphHash,
      integrations: Object.freeze(integrations.map((entry) => Object.freeze(entry))),
    });
  },
  (effect, graph) =>
    observeCompiler("generation", "generateRuntimeIntegrationPlan", effect, () => ({
      nodes: graph.nodes.length,
      edges: graph.edges.length,
    })),
);

/**
 * Resolves required provider and telemetry registrations to their owning packages.
 * @param graph - Canonical normalized graph.
 * @param graphHash - Hash identifying the accepted graph.
 * @param packages - Runtime integration packages declared by authoring imports.
 * @returns Required registrations resolved to uniquely owning packages.
 */
export function generateRuntimeIntegrationPlan(
  graph: RuntimeIntegrationGraph,
  graphHash: string,
  packages: readonly RuntimeIntegrationPackage[] = [],
): RuntimeIntegrationPlan {
  return runCompilerSync(
    generateRuntimeIntegrationPlanEffect(graph, graphHash, packages).pipe(
      Effect.mapError((error) => error.cause),
    ),
  );
}

/**
 * Resolves one required runtime registration to the owning package metadata.
 * @param requirement - Required runtime capability registration.
 * @param packages - Runtime integration packages declared by authoring imports.
 * @returns A lazy effect yielding owned registration metadata or RuntimeIntegrationPlanFailure.
 */
const planEntryEffect = Effect.fnUntraced(function* (
  requirement: RuntimeIntegrationRequirement,
  packages: ReadonlyMap<string, RuntimeIntegrationPackage>,
): Effect.fn.Return<RuntimeIntegrationPlanEntry, RuntimeIntegrationPlanFailure> {
  const selected = packages.get(requirement.integrationId);
  if (selected === undefined)
    return yield* new RuntimeIntegrationPlanFailure({
      cause: new RuntimeIntegrationPlanError(
        "RELKIT_RUNTIME_INTEGRATION_PACKAGE_MISSING",
        requirement.integrationId,
        `Runtime integration package metadata is missing for "${requirement.integrationId}".`,
      ),
    });
  const matches = selected.registrations.some(
    (entry) =>
      entry.capability === requirement.capability &&
      entry.adapterId === requirement.adapterId &&
      entry.protocolVersion === requirement.protocolVersion,
  );
  if (!matches)
    return yield* new RuntimeIntegrationPlanFailure({
      cause: new RuntimeIntegrationPlanError(
        "RELKIT_RUNTIME_INTEGRATION_IDENTITY_INVALID",
        requirement.integrationId,
        `Package "${selected.packageName}" does not register ${requirement.capability}:${requirement.adapterId} protocol ${requirement.protocolVersion}.`,
      ),
    });
  return {
    ...requirement,
    packageName: selected.packageName,
    packageVersion: selected.packageVersion,
    exportName: selected.exportName,
  };
});

/**
 * Indexes integration packages while rejecting conflicting ownership.
 * @param packages - Runtime integration packages declared by authoring imports.
 * @returns A lazy effect yielding the ownership index or RuntimeIntegrationPlanFailure.
 */
const packageMapEffect = Effect.fnUntraced(function* (
  packages: readonly RuntimeIntegrationPackage[],
) {
  const result = new Map<string, RuntimeIntegrationPackage>();
  for (const entry of packages) {
    const existing = result.get(entry.integrationId);
    if (existing !== undefined && packageKey(existing) !== packageKey(entry))
      return yield* new RuntimeIntegrationPlanFailure({
        cause: new RuntimeIntegrationPlanError(
          "RELKIT_RUNTIME_INTEGRATION_IDENTITY_INVALID",
          entry.integrationId,
          `Integration ID "${entry.integrationId}" is owned by multiple packages.`,
        ),
      });
    result.set(entry.integrationId, entry);
  }
  return result;
});

/**
 * Rejects runtime registrations owned by multiple integrations.
 * @param entries - Ordered entries to validate or index.
 * @returns A lazy effect rejecting conflicting registrations with RuntimeIntegrationPlanFailure.
 */
const assertUniqueRegistrationsEffect = Effect.fnUntraced(function* (
  entries: readonly RuntimeIntegrationPlanEntry[],
) {
  const owners = new Map<string, RuntimeIntegrationPlanEntry>();
  for (const entry of entries) {
    const key = `${entry.capability}\0${entry.adapterId}`;
    const existing = owners.get(key);
    if (existing !== undefined)
      return yield* new RuntimeIntegrationPlanFailure({
        cause: new RuntimeIntegrationPlanError(
          "RELKIT_RUNTIME_INTEGRATION_REGISTRATION_DUPLICATE",
          entry.integrationId,
          `Runtime registration ${entry.capability}:${entry.adapterId} is provided by both "${existing.integrationId}" and "${entry.integrationId}".`,
        ),
      });
    owners.set(key, entry);
  }
});

/**
 * Serializes package metadata for ownership equality checks.
 * @param entry - Validated entry to project.
 * @returns Stable serialized package ownership metadata.
 */
function packageKey(entry: RuntimeIntegrationPackage): string {
  return JSON.stringify(entry);
}

/**
 * Recognizes graph nodes carrying validated provider adapter identity.
 * @param node - Parsed source node or normalized graph node.
 * @returns True when the graph node describes a provider binding.
 */
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

/**
 * Creates a stable runtime registration ordering key.
 * @param entry - Validated entry to project.
 * @returns The runtime registration's stable ordering key.
 */
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

export {
  RuntimeIntegrationPlanError,
  RuntimeIntegrationPlanFailure,
} from "./runtime-integration-errors.js";
