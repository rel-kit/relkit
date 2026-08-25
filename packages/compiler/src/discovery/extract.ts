import { createSourceLocation, normalizeSourcePath, type SourceLocation } from "@zsys/contracts";
import type {
  EvaluatorDescriptorSnapshot,
  EvaluatorExportSnapshot,
  EvaluatorManifestReference,
  EvaluatorModuleResult,
  EvaluatorResponse,
} from "./evaluator-protocol.js";
import {
  mapSourceLocations,
  type ExportKind,
  type SourceMapEntry,
  type SourceMapOptions,
} from "./source-map.js";
import type { ExportFact, ExportFacts } from "./source-map-utils.js";
import { resolve } from "node:path";

export interface ExtractOptions extends SourceMapOptions {
  readonly generationId?: string;
  readonly sourceMap?: readonly SourceMapEntry[];
}

export interface ExtractedDescriptor {
  readonly descriptor: EvaluatorDescriptorSnapshot;
  readonly exportName: string;
  readonly exportKind: ExportKind;
  readonly source: SourceLocation;
  readonly facts?: ExportFacts;
  readonly exportFact?: ExportFact;
  readonly reference: EvaluatorManifestReference;
}

export type ExtractionInput = EvaluatorResponse | readonly EvaluatorModuleResult[];

/** Extracts only evaluator snapshots and data-only executable reference instructions. */
export function extractDescriptors(
  input: ExtractionInput,
  options: ExtractOptions = {},
): readonly ExtractedDescriptor[] {
  const response = isResponse(input);
  const modules = response ? input.modules : input;
  const generationId = response ? input.generationId : (options.generationId ?? "unknown");
  const root = resolveRoot(options.projectRoot);
  const sourceMap =
    options.sourceMap ?? mapSourceLocations(modules, { ...options, projectRoot: root });
  const locations = new Map(
    sourceMap.map((entry) => [entryKey(entry.module, entry.exportName), entry]),
  );
  const extracted = [...modules]
    .sort((left, right) => left.file.localeCompare(right.file))
    .flatMap((module) =>
      [...module.exports]
        .sort((left, right) => left.exportName.localeCompare(right.exportName))
        .map((exported) => {
          const moduleFile = normalizeSourcePath(module.file, root);
          const sourceEntry = locations.get(entryKey(moduleFile, exported.exportName));
          const location = sourceEntry?.source ?? createSourceLocation(moduleFile, 1, 1, root);
          const reference = findReference(module, exported, generationId);
          return Object.freeze({
            descriptor: exported.descriptor,
            exportName: exported.exportName,
            exportKind: exportKind(exported.exportName),
            source: Object.freeze(location),
            ...(sourceEntry?.facts === undefined ? {} : { facts: sourceEntry.facts }),
            ...(sourceEntry?.exportFact === undefined
              ? {}
              : { exportFact: sourceEntry.exportFact }),
            reference: Object.freeze(reference),
          });
        }),
    );
  return Object.freeze(extracted);
}

function findReference(
  module: EvaluatorModuleResult,
  exported: EvaluatorExportSnapshot,
  generationId: string,
): EvaluatorManifestReference {
  const existing = module.manifestReferences.find(
    (reference) =>
      reference.module === module.file &&
      reference.exportName === exported.exportName &&
      reference.descriptorId === exported.descriptor.id &&
      reference.kind === exported.descriptor.kind,
  );
  return (
    existing ?? {
      generationId,
      descriptorId: exported.descriptor.id,
      kind: exported.descriptor.kind,
      module: module.file,
      exportName: exported.exportName,
    }
  );
}

function entryKey(module: string, exportName: string): string {
  return `${module}\0${exportName}`;
}

function exportKind(name: string): ExportKind {
  return name === "default" ? "default" : "named";
}

function resolveRoot(projectRoot: string | undefined): string {
  return resolve(projectRoot ?? process.cwd());
}

function isResponse(input: ExtractionInput): input is EvaluatorResponse {
  return !Array.isArray(input);
}
