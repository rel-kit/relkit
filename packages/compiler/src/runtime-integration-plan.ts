/**
 * Builds deterministic selected runtime plans from validated graph requirements.
 * Package provenance and duplicate validation stay below executable imports;
 * dependency requirements retain capability and operation-phase selection.
 */
import {
  RuntimeIntegrationPlanError,
  RuntimeIntegrationPlanFailure,
} from "./runtime-integration-errors.js";
import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import type { RuntimeIntegrationGraph } from "./runtime-integration-plan.types.js";
import { graphIntegrationRequirements } from "./runtime-integration-requirements.js";
import {
  packageMapEffect,
  planEntryEffect,
  entryKey,
  assertUniqueRegistrationsEffect,
} from "./runtime-integration-selection.js";
export type { RuntimeIntegrationPlanErrorCode } from "./runtime-integration-plan.types.js";
import { RUNTIME_INTEGRATION_PLAN_VERSION, type RuntimeIntegrationPlan } from "@relkit/contracts";
import type { RuntimeIntegrationPackage } from "./normalize-types.js";
import { telemetryRequirementsEffect } from "./runtime-integration-telemetry.js";

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
    const providerRequirements = graphIntegrationRequirements(graph);
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

export {
  RuntimeIntegrationPlanError,
  RuntimeIntegrationPlanFailure,
} from "./runtime-integration-errors.js";
