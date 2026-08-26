import { createHash } from "node:crypto";
import type { AstPrefilterCandidate } from "./ast-prefilter.js";
import type { EvaluatorModuleResult, EvaluatorResponse } from "./evaluator-protocol.js";

export function isolateDataModels(
  candidates: readonly AstPrefilterCandidate[],
  generationId: string,
): {
  readonly evaluated: readonly AstPrefilterCandidate[];
  readonly modules: readonly EvaluatorModuleResult[];
} {
  const evaluated: AstPrefilterCandidate[] = [];
  const modules: EvaluatorModuleResult[] = [];
  for (const candidate of candidates) {
    if (!isDataModelOnly(candidate)) {
      evaluated.push(candidate);
      continue;
    }
    const exports = [...candidate.facts.exports].flatMap(([exportName, fact]) =>
      exportName === "default" || fact.factory?.kind === "data-model"
        ? [dataModelExport(candidate.fileName, exportName)]
        : [],
    );
    modules.push({
      file: candidate.fileName,
      exports,
      manifestReferences: exports.map(({ exportName, descriptor }) => ({
        generationId,
        descriptorId: descriptor.id,
        kind: descriptor.kind,
        module: candidate.fileName,
        exportName,
      })),
    });
  }
  return { evaluated: Object.freeze(evaluated), modules: Object.freeze(modules) };
}

export function appendDataModels(
  response: EvaluatorResponse,
  modules: readonly EvaluatorModuleResult[],
): EvaluatorResponse {
  if (response.status !== "ok" || modules.length === 0) return response;
  return {
    ...response,
    modules: Object.freeze(
      [...response.modules, ...modules].sort((left, right) => left.file.localeCompare(right.file)),
    ),
  };
}

function isDataModelOnly(candidate: AstPrefilterCandidate): boolean {
  return (
    candidate.factories.length > 0 &&
    candidate.factories.every((factory) => factory === "defineDataModel")
  );
}

function dataModelExport(file: string, exportName: string) {
  const id = `unbound.data-model.${createHash("sha256").update(file).digest("hex").slice(0, 16)}`;
  const ref = { kind: "data-model", id } as const;
  return {
    exportName,
    descriptor: {
      kind: "data-model",
      id,
      ref,
      metadata: { kind: "data-model", id, ref, tableNames: [] },
    },
  } as const;
}
