import { normalizeSourcePathEffect } from "@relkit/contracts";
import { Effect } from "effect";
import { dirname, extname, join, resolve } from "node:path";
import * as ts from "typescript";
import { observeCompiler } from "../observability.js";
import { runDiscoverySync } from "./discovery-sync.js";
import { DiscoverySourceReader, nodeSourceReader } from "./source-map-source.js";

export { readFacts, readFactsEffect } from "./source-facts.js";
export type {
  ErrorBindingFact,
  ExportFact,
  ExportFacts,
  FactoryBindingFact,
  FactoryIdPresence,
  RouteOperationFact,
  ServiceMemberFact,
  SourceFactoryKind,
  SourceFacts,
} from "./source-facts.js";

export type { ParsedSource } from "./source-map-utils.types.js";

/**
 * Selects the parser's syntax mode from the filename extension.
 * @param file - Source filename.
 * @returns TypeScript's parser mode; this primitive classifier has no domain validation.
 */
export function sourceScriptKind(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  return ts.ScriptKind.TS;
}

/**
 * Resolves a relative re-export using supplemental text before the source reader.
 * @param file - Project-relative importing file.
 * @param module - Import specifier; bare imports cannot resolve source locations.
 * @param root - Absolute project root.
 * @param texts - Supplemental project-relative sources.
 * @returns A lazy effect yielding the first valid candidate, or undefined.
 * @remarks Requires DiscoverySourceReader. Outside-root paths intentionally do not resolve.
 */
export const resolveImportEffect = Effect.fn("discovery.source.resolve-import")(
  function* (file: string, module: string, root: string, texts: ReadonlyMap<string, string>) {
    if (!module.startsWith(".")) return undefined;
    const base = resolve(root, dirname(file), module);
    const extension = extname(base);
    const substitutions =
      extension === ".js"
        ? [".ts", ".tsx"]
        : extension === ".jsx"
          ? [".tsx"]
          : extension === ".mjs"
            ? [".mts"]
            : extension === ".cjs"
              ? [".cts"]
              : [];
    const candidates = extension
      ? [
          base,
          ...substitutions.map((replacement) => base.slice(0, -extension.length) + replacement),
        ]
      : [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, join(base, "index.ts")];
    const reader = yield* DiscoverySourceReader;
    for (const candidate of candidates) {
      const relative = yield* normalizeSourcePathEffect(candidate, root).pipe(
        Effect.catchTag("SourceLocationError", () => Effect.succeed(undefined)),
      );
      if (relative === undefined) return undefined;
      if (texts.has(relative) || (yield* reader.exists(candidate))) return relative;
    }
    return undefined;
  },
  (effect) => observeCompiler("discovery", "resolveImport", effect, () => ({ files: 1 }), false),
);

/**
 * Synchronous compatibility adapter for relative import resolution.
 * @param file - Project-relative importing file.
 * @param module - Relative import specifier.
 * @param root - Absolute project root.
 * @param texts - Supplemental source text indexed by relative path.
 * @returns The first matching project-relative path, or undefined.
 */
export function resolveImport(
  file: string,
  module: string,
  root: string,
  texts: ReadonlyMap<string, string>,
): string | undefined {
  return runDiscoverySync(
    resolveImportEffect(file, module, root, texts).pipe(
      Effect.provideService(DiscoverySourceReader, nodeSourceReader),
    ),
  );
}
