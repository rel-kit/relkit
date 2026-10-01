import { createContextEffect } from "./source-map-context.js";
import { observeCompiler } from "../observability.js";
import { createSourceLocationEffect, normalizeSourcePathEffect } from "@relkit/contracts";
import { Effect } from "effect";
import { resolve } from "node:path";
import * as ts from "typescript";
import type { EvaluatorModuleResult } from "./evaluator-protocol.js";
import { readFactsEffect, resolveImportEffect, sourceScriptKind } from "./source-map-utils.js";
import { DiscoverySourceReader, nodeSourceReader } from "./source-map-source.js";
import * as Models from "./source-map-schema.js";
import type * as Mapping from "./source-map.types.js";
import type { ParsedSource } from "./source-map-utils.types.js";
import { runDiscoverySync } from "./discovery-sync.js";

export type {
  ErrorBindingFact,
  ExportFact,
  ExportFacts,
  FactoryBindingFact,
  FactoryIdPresence,
  RouteOperationFact,
  ServiceMemberFact,
  SourceFacts,
  SourceFactoryKind,
} from "./source-map-utils.js";
export type {
  ExportKind,
  SourceMapSource,
  SourceMapOptions,
  SourceMapEntry,
} from "./source-map.types.js";

/**
 * Maps evaluated exports to sorted, immutable project-relative source positions.
 * @param modules - Evaluator snapshots to locate.
 * @param options - Project root and optional supplemental source text.
 * @returns A lazy effect yielding stable source entries or SourceLocationError.
 * @remarks Requires DiscoverySourceReader. Missing/unreadable sources use line one;
 * reader and AST defects and interruption remain visible. Caches belong to this run.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { mapSourceLocationsEffect } from "./source-map.js";
 * import { DiscoverySourceReader, nodeSourceReader } from "./source-map-source.js";
 * const locations = Effect.runSync(mapSourceLocationsEffect([], { projectRoot: process.cwd() })
 *   .pipe(Effect.provideService(DiscoverySourceReader, nodeSourceReader)));
 * ```
 */
export const mapSourceLocationsEffect = Effect.fn("discovery.source.map")(
  function* (modules: readonly EvaluatorModuleResult[], options: Mapping.SourceMapOptions = {}) {
    const context = yield* createContextEffect(options);
    const entries: Mapping.SourceMapEntry[] = [];
    yield* Effect.forEach(
      modules,
      (module) =>
        Effect.gen(function* () {
          const file = yield* normalizeSourcePathEffect(module.file, context.root);
          yield* Effect.forEach(
            module.exports,
            (exported) =>
              Effect.gen(function* () {
                const located = yield* locateEffect(file, exported.exportName, context, new Set());
                const source =
                  located?.source ?? (yield* createSourceLocationEffect(file, 1, 1, context.root));
                entries.push(
                  Object.freeze(
                    Models.SourceMapEntry.make({
                      module: file,
                      exportName: exported.exportName,
                      exportKind: exported.exportName === "default" ? "default" : "named",
                      source: Object.freeze(source),
                      ...(located?.facts === undefined ? {} : { facts: located.facts }),
                      ...(located?.exportFact === undefined
                        ? {}
                        : { exportFact: located.exportFact }),
                    }),
                  ),
                );
              }),
            { discard: true },
          );
        }),
      { discard: true },
    );
    return Object.freeze(
      entries.sort(
        (left, right) =>
          left.module.localeCompare(right.module) ||
          left.exportName.localeCompare(right.exportName),
      ),
    );
  },
  (effect, modules, options: Mapping.SourceMapOptions = {}) =>
    observeCompiler(
      "discovery",
      "mapSourceLocations",
      effect,
      () => ({ files: modules.length }),
      true,
    ),
);

/**
 * Synchronous compatibility boundary for source mapping.
 * @param modules - Evaluator snapshots to locate.
 * @param options - Project root and supplemental sources.
 * @returns Immutable entries sorted by module and export name.
 * @throws SourceLocationError for invalid evaluated module paths; preserves defects.
 */
export function mapSourceLocations(
  modules: readonly EvaluatorModuleResult[],
  options: Mapping.SourceMapOptions = {},
): readonly Mapping.SourceMapEntry[] {
  return runDiscoverySync(
    mapSourceLocationsEffect(modules, options).pipe(
      Effect.provideService(DiscoverySourceReader, nodeSourceReader),
    ),
  );
}

/** {@inheritDoc mapSourceLocations} */
export const createSourceMap = mapSourceLocations;

/**
 * Traverses explicit and star re-exports with cycle detection.
 * @param file - Normalized source file.
 * @param exportName - Export binding sought in that file.
 * @param context - Run-local caches and source root.
 * @param visited - Traversal-owned binding keys; prevents re-export cycles.
 * @returns A lazy effect yielding source provenance, or undefined for missing/cyclic origins.
 */
const locateEffect = Effect.fn("discovery.source.locate")(function* (
  file: string,
  exportName: string,
  context: Mapping.MapContext,
  visited: Set<string>,
): Effect.fn.Return<
  Mapping.LocatedSource | undefined,
  import("@relkit/contracts").SourceLocationError,
  DiscoverySourceReader
> {
  const key = `${file}\0${exportName}`;
  if (visited.has(key)) return undefined;
  visited.add(key);
  const parsed = yield* parseSourceEffect(file, context);
  if (parsed === undefined) return undefined;
  const fact = parsed.facts.exports.get(exportName);
  if (fact?.origin !== undefined) {
    const originFile = yield* resolveImportEffect(
      file,
      fact.origin.module,
      context.root,
      context.texts,
    );
    if (originFile !== undefined)
      return yield* locateEffect(originFile, fact.origin.name, context, visited);
  }
  if (fact !== undefined)
    return Models.LocatedSource.make({
      source: yield* positionEffect(file, parsed.sourceFile, fact.position, context.root),
      facts: parsed.facts,
      exportFact: fact,
    });
  for (const star of parsed.facts.stars) {
    const originFile = yield* resolveImportEffect(file, star.module, context.root, context.texts);
    if (originFile !== undefined) {
      const origin = yield* locateEffect(originFile, exportName, context, visited);
      if (origin !== undefined) return origin;
    }
  }
  return undefined;
});

/**
 * Parses a source once per invocation, including negative lookup memoization.
 * @param file - Normalized source file.
 * @param context - Invocation-owned mutable caches.
 * @returns A lazy effect yielding a trusted TypeScript AST and facts, or undefined.
 */
const parseSourceEffect = Effect.fn("discovery.source.parse")(function* (
  file: string,
  context: Mapping.MapContext,
) {
  if (context.parsed.has(file)) return context.parsed.get(file);
  const text = yield* sourceTextEffect(file, context);
  if (text === undefined) {
    context.parsed.set(file, undefined);
    return undefined;
  }
  const sourceFile = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    sourceScriptKind(file),
  );
  const parsed = { sourceFile, facts: yield* readFactsEffect(sourceFile) } satisfies ParsedSource;
  context.parsed.set(file, parsed);
  return parsed;
});

/**
 * Reads supplemental text or delegates a single native source lookup.
 * @param file - Normalized source file.
 * @param context - Root and supplemental sources owned by this invocation.
 * @returns A lazy effect yielding text or undefined for known missing/unreadable sources.
 * @remarks Typed SourceMapReadError is the sole read recovery; defects are preserved.
 */
const sourceTextEffect = Effect.fn("discovery.source.text")(function* (
  file: string,
  context: Mapping.MapContext,
) {
  const supplied = context.texts.get(file);
  if (supplied !== undefined) return supplied;
  const reader = yield* DiscoverySourceReader;
  const absolute = resolve(context.root, file);
  if (!(yield* reader.exists(absolute))) return undefined;
  return yield* reader
    .read(absolute)
    .pipe(Effect.catchTag("SourceMapReadError", () => Effect.succeed(undefined)));
});

/**
 * Converts an AST offset to portable one-based coordinates.
 * @param file - Normalized source file.
 * @param sourceFile - Trusted TypeScript AST containing the offset.
 * @param offset - Candidate UTF-16 character position, clamped to the AST bounds.
 * @param root - Absolute project root.
 * @returns A lazy effect yielding a validated source location.
 */
const positionEffect = Effect.fn("discovery.source.position")(function* (
  file: string,
  sourceFile: ts.SourceFile,
  offset: number,
  root: string,
) {
  const line = sourceFile.getLineAndCharacterOfPosition(
    Math.max(0, Math.min(offset, sourceFile.end)),
  );
  return yield* createSourceLocationEffect(file, line.line + 1, line.character + 1, root);
});
