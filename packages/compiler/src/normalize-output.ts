import {
  generateClient,
  generateClientContractDocument,
  generateContract,
} from "@zsys/client-generator";
import { canonicalJson } from "@zsys/contracts";
import { generateOpenApiJson } from "@zsys/openapi";
import { canonicalGraphJson, type ApplicationGraph } from "@zsys/graph";
import { generateManifest, type GeneratedManifest } from "./generate-manifest.js";
import { isRecord } from "./normalize-utils.js";
import type { GeneratedOutputs, NormalizedGraph, NormalizationWork } from "./normalize-types.js";

export function makeOutputs(
  graph: NormalizedGraph,
  hash: string,
  diagnostics: readonly unknown[],
  work: NormalizationWork,
  manifest?: GeneratedManifest,
): GeneratedOutputs {
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
  return Object.freeze({
    graph: `${canonicalGraphJson(
      graph,
      work.input.projectRoot === undefined ? {} : { projectRoot: work.input.projectRoot },
    )}\n`,
    manifest: generatedManifest.activatable ? generatedManifest.source : "",
    diagnostics: `${canonicalJson(diagnostics)}\n`,
    openapi: generatedOpenApi(graph, diagnostics),
    client: generatedClient(graph, diagnostics),
    contract: hasErrors(diagnostics) ? "" : generateContract(graph as unknown as ApplicationGraph),
    clientContract: hasErrors(diagnostics)
      ? ""
      : generateClientContractDocument(graph as unknown as ApplicationGraph, hash),
  });
}

function isDiagnostic(value: unknown): value is import("@zsys/diagnostics").Diagnostic {
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
