import { createSourceLocation, normalizeSourcePath, type SourceLocation } from "@zsys/contracts";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";
import type { EvaluatorModuleResult } from "./evaluator-protocol.js";
import {
  readFacts,
  resolveImport,
  type ExportFact,
  type ExportFacts,
  type ParsedSource,
} from "./source-map-utils.js";

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

export type ExportKind = "default" | "named";

export interface SourceMapSource {
  readonly fileName: string;
  readonly text: string;
}

export interface SourceMapOptions {
  readonly projectRoot?: string;
  readonly sources?: readonly SourceMapSource[];
}

export interface SourceMapEntry {
  readonly module: string;
  readonly exportName: string;
  readonly exportKind: ExportKind;
  readonly source: SourceLocation;
  readonly facts?: ExportFacts;
  readonly exportFact?: ExportFact;
}

interface LocatedSource {
  readonly source: SourceLocation;
  readonly facts?: ExportFacts;
  readonly exportFact?: ExportFact;
}

interface MapContext {
  readonly root: string;
  readonly texts: Map<string, string>;
  readonly parsed: Map<string, ParsedSource | undefined>;
}

/** Maps evaluated export facts to stable project-relative source positions. */
export function mapSourceLocations(
  modules: readonly EvaluatorModuleResult[],
  options: SourceMapOptions = {},
): readonly SourceMapEntry[] {
  const context = createContext(options);
  const entries = modules.flatMap((module) =>
    module.exports.map((exported) => {
      const file = relativeFile(module.file, context.root);
      const located = locate(file, exported.exportName, context, new Set());
      const source = located?.source ?? createSourceLocation(file, 1, 1, context.root);
      return Object.freeze({
        module: file,
        exportName: exported.exportName,
        exportKind: exportKind(exported.exportName),
        source: Object.freeze(source),
        ...(located?.facts === undefined ? {} : { facts: located.facts }),
        ...(located?.exportFact === undefined ? {} : { exportFact: located.exportFact }),
      });
    }),
  );
  return Object.freeze(
    entries.sort(
      (left, right) =>
        left.module.localeCompare(right.module) || left.exportName.localeCompare(right.exportName),
    ),
  );
}

/** Alias used by compiler callers that treat the entries as a source map. */
export const createSourceMap = mapSourceLocations;

function createContext(options: SourceMapOptions): MapContext {
  const root = resolve(options.projectRoot ?? process.cwd());
  const texts = new Map<string, string>();
  for (const source of options.sources ?? []) {
    try {
      texts.set(relativeFile(source.fileName, root), source.text);
    } catch {
      // Invalid supplemental paths cannot be source locations in this project.
    }
  }
  return { root, texts, parsed: new Map() };
}

function locate(
  file: string,
  exportName: string,
  context: MapContext,
  visited: Set<string>,
): LocatedSource | undefined {
  if (visited.has(`${file}\0${exportName}`)) return undefined;
  visited.add(`${file}\0${exportName}`);
  const parsed = parseSource(file, context);
  if (parsed === undefined) return undefined;
  const fact = parsed.facts.exports.get(exportName);
  if (fact?.origin !== undefined) {
    const originFile = resolveImport(file, fact.origin.module, context.root, context.texts);
    if (originFile !== undefined) {
      return locate(originFile, fact.origin.name, context, visited);
    }
  }
  if (fact !== undefined) {
    return {
      source: position(file, parsed.sourceFile, fact.position, context.root),
      facts: parsed.facts,
      exportFact: fact,
    };
  }
  for (const star of parsed.facts.stars) {
    const originFile = resolveImport(file, star.module, context.root, context.texts);
    if (originFile !== undefined) {
      const origin = locate(originFile, exportName, context, visited);
      if (origin !== undefined) return origin;
    }
    return {
      source: position(file, parsed.sourceFile, star.position, context.root),
      facts: parsed.facts,
    };
  }
  return { source: position(file, parsed.sourceFile, 0, context.root), facts: parsed.facts };
}

function parseSource(file: string, context: MapContext): ParsedSource | undefined {
  if (context.parsed.has(file)) return context.parsed.get(file);
  const text = sourceText(file, context);
  if (text === undefined) {
    context.parsed.set(file, undefined);
    return undefined;
  }
  const sourceFile = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file),
  );
  const parsed = { sourceFile, facts: readFacts(sourceFile) } satisfies ParsedSource;
  context.parsed.set(file, parsed);
  return parsed;
}

function sourceText(file: string, context: MapContext): string | undefined {
  const supplied = context.texts.get(file);
  if (supplied !== undefined) return supplied;
  const absolute = resolve(context.root, file);
  if (!existsSync(absolute)) return undefined;
  try {
    return readFileSync(absolute, "utf8");
  } catch {
    return undefined;
  }
}

function position(
  file: string,
  sourceFile: ts.SourceFile,
  offset: number,
  root: string,
): SourceLocation {
  const safeOffset = Math.max(0, Math.min(offset, sourceFile.end));
  const line = sourceFile.getLineAndCharacterOfPosition(safeOffset);
  return createSourceLocation(file, line.line + 1, line.character + 1, root);
}

function relativeFile(file: string, root: string): string {
  return normalizeSourcePath(file, root);
}

function exportKind(name: string): ExportKind {
  return name === "default" ? "default" : "named";
}

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  return ts.ScriptKind.TS;
}
