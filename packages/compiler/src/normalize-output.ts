import type { CompilerGenerationFailure } from "./normalize-output.types.js";
import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import {
  generateClientEffect,
  generateClientContractDocumentEffect,
  generateClientManifestEffect,
  generateClientRegistryEffect,
  generateContractEffect,
} from "@relkit/client-generator";
import { canonicalJson, type RuntimeIntegrationPlan } from "@relkit/contracts";
import { generateOpenApiJsonEffect } from "@relkit/openapi";
import { canonicalGraphJsonEffect, type ApplicationGraph } from "@relkit/graph";
import type { LocalServicePlan } from "@relkit/local-service";
import { createRuntimeActivationFingerprintEffect } from "./activation-fingerprint.js";
import { type GeneratedManifest, generateManifestEffect } from "./generate-manifest.js";
import { type GeneratedJobsManifest, generateJobsManifestEffect } from "./jobs/manifest.js";
import { isRecord } from "./normalize-utils.js";
import { generateRuntimeIntegrationImportsEffect } from "./runtime-integration-imports.js";
import type { GeneratedOutputs, NormalizedGraph, NormalizationWork } from "./normalize-types.js";

/**
 * Renders compiler artifacts and generated contracts for the accepted graph.
 * @param graph - Canonical normalized graph.
 * @param hash - Canonical graph fingerprint used by generated contracts.
 * @param diagnostics - Ordered compiler diagnostics.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param manifest - Precomputed executable manifest and diagnostics, when available.
 * @param jobsManifest - Precomputed task/job executable manifest, when available.
 * @param runtimeIntegrations - Resolved runtime registration plan, when available.
 * @param localServices - Selected local service plan, when available.
 * @returns A lazy effect that renders compiler artifacts and generated contracts for the accepted graph; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const makeOutputsEffect = Effect.fn("Compiler.makeOutputs")(
  function* (
    graph: NormalizedGraph,
    hash: string,
    diagnostics: readonly unknown[],
    work: NormalizationWork,
    manifest?: GeneratedManifest,
    jobsManifest?: GeneratedJobsManifest,
    runtimeIntegrations?: RuntimeIntegrationPlan,
    localServices?: LocalServicePlan,
  ): Effect.fn.Return<GeneratedOutputs, CompilerGenerationFailure> {
    const errors = hasErrors(diagnostics);
    const generatedManifest =
      manifest ??
      (yield* generateManifestEffect({
        graph,
        graphHash: hash,
        descriptors: work.descriptors,
        middleware: [...work.middlewareReferences.values()],
        transforms: [...work.transformReferences.values()],
        diagnostics: diagnostics.filter(isDiagnostic),
        ...(work.input.projectRoot === undefined ? {} : { projectRoot: work.input.projectRoot }),
      }));
    const generatedJobsManifest =
      jobsManifest ??
      (hasTaskJobs(work)
        ? yield* generateJobsManifestEffect({
            graph,
            graphHash: hash,
            descriptors: work.descriptors,
            diagnostics: diagnostics.filter(isDiagnostic),
            work,
            ...(work.input.projectRoot === undefined
              ? {}
              : { projectRoot: work.input.projectRoot }),
          })
        : undefined);
    const graphSource = `${yield* canonicalGraphJsonEffect(
      graph,
      work.input.projectRoot === undefined ? {} : { projectRoot: work.input.projectRoot },
    )}\n`;
    const manifestSource = generatedManifest.activatable ? generatedManifest.source : "";
    const runtimeIntegrationsSource =
      runtimeIntegrations === undefined || errors ? "" : `${canonicalJson(runtimeIntegrations)}\n`;
    const localServicesSource =
      localServices === undefined || errors ? "" : `${canonicalJson(localServices)}\n`;
    const runtimeActivation =
      manifestSource === "" || runtimeIntegrationsSource === ""
        ? ""
        : `${canonicalJson(
            yield* createRuntimeActivationFingerprintEffect({
              graphHash: hash,
              manifestSource,
              ...(generatedJobsManifest?.activatable
                ? { jobsManifestSource: generatedJobsManifest.source }
                : {}),
              runtimeIntegrationsPlanSource: runtimeIntegrationsSource,
              ...(localServices?.services.length === 0 || localServicesSource === ""
                ? {}
                : { localServicesPlanSource: localServicesSource }),
            }),
          )}\n`;
    return Object.freeze({
      graph: graphSource,
      manifest: manifestSource,
      runtimeActivation,
      runtimeIntegrations: runtimeIntegrationsSource,
      runtimeIntegrationImports:
        runtimeIntegrations === undefined || errors
          ? ""
          : yield* generateRuntimeIntegrationImportsEffect(runtimeIntegrations),
      localServices: localServicesSource,
      diagnostics: `${canonicalJson(diagnostics)}\n`,
      ...(generatedJobsManifest === undefined || !generatedJobsManifest.activatable
        ? {}
        : { jobsManifest: generatedJobsManifest.source }),
      openapi: yield* generatedOpenApiEffect(graph, diagnostics),
      client: yield* generatedClientEffect(graph, diagnostics),
      contract: errors ? "" : yield* generateContractEffect(graph as unknown as ApplicationGraph),
      clientContract: errors
        ? ""
        : yield* generateClientContractDocumentEffect(graph as unknown as ApplicationGraph, hash),
      clientRegistry: errors
        ? ""
        : yield* generateClientRegistryEffect(graph as unknown as ApplicationGraph),
      clientManifest: errors
        ? ""
        : yield* generateClientManifestEffect(graph as unknown as ApplicationGraph),
    });
  },
  (
    effect,
    graph,
    hash,
    diagnostics,
    work,
    manifest?: GeneratedManifest,
    jobsManifest?: GeneratedJobsManifest,
    runtimeIntegrations?: RuntimeIntegrationPlan,
    localServices?: LocalServicePlan,
  ) =>
    observeCompiler("generation", "makeOutputs", effect, () => ({
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      diagnostics: diagnostics.length,
      descriptors: work.descriptors.length,
    })),
);

/**
 * Renders compiler artifacts and generated contracts for the accepted graph.
 * @param graph - Canonical normalized graph.
 * @param hash - Canonical graph fingerprint used by generated contracts.
 * @param diagnostics - Ordered compiler diagnostics.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param manifest - Precomputed executable manifest and diagnostics, when available.
 * @param jobsManifest - Precomputed task/job executable manifest, when available.
 * @param runtimeIntegrations - Resolved runtime registration plan, when available.
 * @param localServices - Selected local service plan, when available.
 * @returns The manifest, graph, OpenAPI, client, and contract source artifacts.
 */
export function makeOutputs(
  graph: NormalizedGraph,
  hash: string,
  diagnostics: readonly unknown[],
  work: NormalizationWork,
  manifest?: GeneratedManifest,
  jobsManifest?: GeneratedJobsManifest,
  runtimeIntegrations?: RuntimeIntegrationPlan,
  localServices?: LocalServicePlan,
): GeneratedOutputs {
  return runCompilerSync(
    makeOutputsEffect(
      graph,
      hash,
      diagnostics,
      work,
      manifest,
      jobsManifest,
      runtimeIntegrations,
      localServices,
    ),
  );
}

/**
 * Checks whether a compilation contains task-backed job artifacts.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns True when task descriptors or task-backed jobs require job artifacts.
 */
function hasTaskJobs(work: NormalizationWork): boolean {
  return work.descriptors.some(
    (descriptor) =>
      descriptor.kind === "task" || (descriptor.kind === "job" && isTaskJob(descriptor)),
  );
}

/**
 * Recognizes a normalized task-backed job descriptor.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @returns True when the job declares a task reference.
 */
function isTaskJob(descriptor: NormalizationWork["descriptors"][number]): boolean {
  return isRecord(descriptor.value) && isRecord(descriptor.value.task);
}

/**
 * Recognizes a compiler diagnostic carried by a generation result.
 * @param value - Declared metadata inspected without coercion.
 * @returns True when the record carries compiler diagnostic code and severity.
 */
function isDiagnostic(value: unknown): value is import("@relkit/diagnostics").Diagnostic {
  return isRecord(value) && typeof value.code === "string" && typeof value.severity === "string";
}

/**
 * Renders OpenAPI only for a graph without blocking diagnostics.
 * @param graph - Canonical normalized graph.
 * @param diagnostics - Ordered compiler diagnostics.
 * @returns A lazy effect yielding generated source, or an empty string when diagnostics block generation; typed generator failures propagate.
 */
const generatedOpenApiEffect = Effect.fn("Compiler.generatedOpenApi")(function* (
  graph: NormalizedGraph,
  diagnostics: readonly unknown[],
) {
  return hasErrors(diagnostics)
    ? ""
    : yield* generateOpenApiJsonEffect(graph as unknown as ApplicationGraph);
});

/**
 * Renders a client module only for a graph without blocking diagnostics.
 * @param graph - Canonical normalized graph.
 * @param diagnostics - Ordered compiler diagnostics.
 * @returns A lazy effect yielding generated source, or an empty string when diagnostics block generation; typed generator failures propagate.
 */
const generatedClientEffect = Effect.fn("Compiler.generatedClient")(function* (
  graph: NormalizedGraph,
  diagnostics: readonly unknown[],
) {
  return hasErrors(diagnostics)
    ? ""
    : yield* generateClientEffect(graph as unknown as ApplicationGraph);
});

/**
 * Checks whether diagnostics contain a blocking error.
 * @param diagnostics - Ordered compiler diagnostics.
 * @returns True when any diagnostic blocks activation.
 */
function hasErrors(diagnostics: readonly unknown[]): boolean {
  return diagnostics.some((diagnostic) => isRecord(diagnostic) && diagnostic.severity === "error");
}
