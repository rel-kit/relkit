import {
  generateClient,
  generateClientContractDocument,
  generateContract,
} from "@relkit/client-generator";
import { canonicalJson, type RuntimeIntegrationPlan } from "@relkit/contracts";
import { generateOpenApiJson } from "@relkit/openapi";
import { canonicalGraphJson, type ApplicationGraph } from "@relkit/graph";
import type { LocalServicePlan } from "@relkit/local-service";
import { createRuntimeActivationFingerprint } from "./activation-fingerprint.js";
import { generateManifest, type GeneratedManifest } from "./generate-manifest.js";
import { isRecord } from "./normalize-utils.js";
import { generateRuntimeIntegrationImports } from "./runtime-integration-imports.js";
import type { GeneratedOutputs, NormalizedGraph, NormalizationWork } from "./normalize-types.js";

export function makeOutputs(
  graph: NormalizedGraph,
  hash: string,
  diagnostics: readonly unknown[],
  work: NormalizationWork,
  manifest?: GeneratedManifest,
  runtimeIntegrations?: RuntimeIntegrationPlan,
  localServices?: LocalServicePlan,
): GeneratedOutputs {
  const errors = hasErrors(diagnostics);
  const generatedManifest =
    manifest ??
    generateManifest({
      graph,
      graphHash: hash,
      descriptors: work.descriptors,
      middleware: [...work.middlewareReferences.values()],
      transforms: [...work.transformReferences.values()],
      diagnostics: diagnostics.filter(isDiagnostic),
      ...(work.input.projectRoot === undefined ? {} : { projectRoot: work.input.projectRoot }),
    });
  const graphSource = `${canonicalGraphJson(
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
          createRuntimeActivationFingerprint({
            graphHash: hash,
            manifestSource,
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
        : generateRuntimeIntegrationImports(runtimeIntegrations),
    localServices: localServicesSource,
    diagnostics: `${canonicalJson(diagnostics)}\n`,
    openapi: generatedOpenApi(graph, diagnostics),
    client: generatedClient(graph, diagnostics),
    contract: errors ? "" : generateContract(graph as unknown as ApplicationGraph),
    clientContract: errors
      ? ""
      : generateClientContractDocument(graph as unknown as ApplicationGraph, hash),
  });
}

function isDiagnostic(value: unknown): value is import("@relkit/diagnostics").Diagnostic {
  return isRecord(value) && typeof value.code === "string" && typeof value.severity === "string";
}

function generatedOpenApi(graph: NormalizedGraph, diagnostics: readonly unknown[]): string {
  return hasErrors(diagnostics) ? "" : generateOpenApiJson(graph as unknown as ApplicationGraph);
}

function generatedClient(graph: NormalizedGraph, diagnostics: readonly unknown[]): string {
  return hasErrors(diagnostics) ? "" : generateClient(graph as unknown as ApplicationGraph);
}

function hasErrors(diagnostics: readonly unknown[]): boolean {
  return diagnostics.some((diagnostic) => isRecord(diagnostic) && diagnostic.severity === "error");
}
