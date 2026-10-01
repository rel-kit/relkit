import { observeCompiler } from "../observability.js";
import { createSourceLocationEffect, normalizeSourcePathEffect } from "@relkit/contracts";
import { Effect } from "effect";
import { resolve } from "node:path";
import type {
  EvaluatorExportSnapshot,
  EvaluatorModuleResult,
  EvaluatorResponse,
} from "./evaluator-protocol.js";
import { mapSourceLocationsEffect } from "./source-map.js";
import { DiscoverySourceReader, nodeSourceReader } from "./source-map-source.js";
import * as Models from "./extract-schema.js";
import { EvaluatorManifestReference } from "./evaluator-protocol-schema.js";
import type { ExtractedDescriptor, ExtractionInput, ExtractOptions } from "./extract.types.js";
import { runDiscoverySync } from "./discovery-sync.js";

export type { ExtractOptions, ExtractedDescriptor, ExtractionInput } from "./extract.types.js";

/**
 * Extracts immutable evaluator snapshots with source provenance and executable references.
 * @param input - Evaluator response or its data-only module snapshots.
 * @param options - Root, source map, supplemental sources, and fallback generation identity.
 * @returns A lazy effect yielding extracted snapshots; invalid evaluated paths fail with SourceLocationError.
 * @remarks Requires DiscoverySourceReader when a map must be built. Existing manifest
 * references take precedence over the fallback generation ID. No executable values are evaluated.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { extractDescriptorsEffect } from "./extract.js";
 * import { DiscoverySourceReader, nodeSourceReader } from "./source-map-source.js";
 * const descriptors = Effect.runSync(extractDescriptorsEffect([], { projectRoot: process.cwd() })
 *   .pipe(Effect.provideService(DiscoverySourceReader, nodeSourceReader)));
 * ```
 */
export const extractDescriptorsEffect = Effect.fn("discovery.extract.descriptors")(
  function* (input: ExtractionInput, options: ExtractOptions = {}) {
    const response = isResponse(input);
    const modules = response ? input.modules : input;
    const generationId = response ? input.generationId : (options.generationId ?? "unknown");
    const root = resolve(options.projectRoot ?? process.cwd());
    const sourceMap =
      options.sourceMap ??
      (yield* mapSourceLocationsEffect(modules, { ...options, projectRoot: root }));
    const locations = new Map(
      sourceMap.map((entry) => [entryKey(entry.module, entry.exportName), entry]),
    );
    const extracted: ExtractedDescriptor[] = [];
    yield* Effect.forEach(
      [...modules].sort((left, right) => left.file.localeCompare(right.file)),
      (module) =>
        Effect.gen(function* () {
          const moduleFile = yield* normalizeSourcePathEffect(module.file, root);
          yield* Effect.forEach(
            [...module.exports].sort((left, right) =>
              left.exportName.localeCompare(right.exportName),
            ),
            (exported) =>
              Effect.gen(function* () {
                const sourceEntry = locations.get(entryKey(moduleFile, exported.exportName));
                const location =
                  sourceEntry?.source ??
                  (yield* createSourceLocationEffect(moduleFile, 1, 1, root));
                const reference = yield* findReferenceEffect(module, exported, generationId);
                extracted.push(
                  Object.freeze(
                    Models.ExtractedDescriptor.make({
                      descriptor: exported.descriptor,
                      exportName: exported.exportName,
                      exportKind: exported.exportName === "default" ? "default" : "named",
                      source: Object.freeze(location),
                      reference: Object.freeze(reference),
                      ...(sourceEntry?.facts === undefined ? {} : { facts: sourceEntry.facts }),
                      ...(sourceEntry?.exportFact === undefined
                        ? {}
                        : { exportFact: sourceEntry.exportFact }),
                    }),
                  ),
                );
              }),
            { discard: true },
          );
        }),
      { discard: true },
    );
    return Object.freeze(extracted);
  },
  (effect, input, options: ExtractOptions = {}) =>
    observeCompiler(
      "discovery",
      "extractDescriptors",
      effect,
      () => ({ files: (isResponse(input) ? input.modules : input).length }),
      true,
    ),
);

/**
 * Synchronous compatibility boundary for descriptor extraction.
 * @param input - Evaluator response or data-only module snapshots.
 * @param options - Project root, source provenance, and fallback generation identity.
 * @returns Sorted immutable extracted descriptors.
 * @throws SourceLocationError for invalid evaluated source paths; preserves defects.
 */
export function extractDescriptors(
  input: ExtractionInput,
  options: ExtractOptions = {},
): readonly ExtractedDescriptor[] {
  return runDiscoverySync(
    extractDescriptorsEffect(input, options).pipe(
      Effect.provideService(DiscoverySourceReader, nodeSourceReader),
    ),
  );
}

/**
 * Retains an existing executable reference or constructs a data-only fallback.
 * @param module - Evaluated module containing authoritative manifest references.
 * @param exported - Evaluated export to bind.
 * @param generationId - Fallback generation identity when no reference exists.
 * @returns A lazy effect yielding the matching or newly constructed reference.
 */
const findReferenceEffect = Effect.fn("discovery.extract.reference")(function* (
  module: EvaluatorModuleResult,
  exported: EvaluatorExportSnapshot,
  generationId: string,
) {
  return (
    module.manifestReferences.find(
      (reference) =>
        reference.module === module.file &&
        reference.exportName === exported.exportName &&
        reference.descriptorId === exported.descriptor.id &&
        reference.kind === exported.descriptor.kind,
    ) ??
    EvaluatorManifestReference.make({
      generationId,
      descriptorId: exported.descriptor.id,
      kind: exported.descriptor.kind,
      module: module.file,
      exportName: exported.exportName,
    })
  );
});

/**
 * Joins primitive lookup keys using an unambiguous internal separator.
 * @param module - Normalized module name.
 * @param exportName - Evaluated export name.
 * @returns The run-local map key; no domain validation occurs here.
 */
function entryKey(module: string, exportName: string): string {
  return `${module}\0${exportName}`;
}

/**
 * Selects the response branch of the authoritative extraction input union.
 * @param input - Already-typed evaluator response or module list.
 * @returns Whether the input is the response variant; this is a primitive shape predicate.
 */
function isResponse(input: ExtractionInput): input is EvaluatorResponse {
  return !Array.isArray(input);
}
