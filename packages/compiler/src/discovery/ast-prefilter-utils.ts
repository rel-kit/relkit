import { Effect } from "effect";
import * as ts from "typescript";
import { observeCompiler } from "../observability.js";
import { readReExportEffect } from "./ast-prefilter-reexports.js";
import {
  expressionName,
  hasDefaultModifier,
  isDescriptorBrandCall,
  isRuntimeExport,
  isRuntimeImport,
  lastSegment,
  runtimeModuleSpecifier,
  scriptKind,
} from "./ast-prefilter-syntax.js";
import type {
  AstCandidateIndicator,
  AstPrefilterCandidate,
  AstReExport,
} from "./ast-prefilter.types.js";
import { runDiscoverySync } from "./discovery-sync.js";
import { readFactsEffect } from "./source-facts.js";
const KNOWN_FACTORIES = new Set([
  "asTool",
  "defineApp",
  "defineConfig",
  "defineConstants",
  "definePrompt",
  "defineDrizzleService",
  "defineBetterAuthService",
  "defineFunction",
  "defineError",
  "defineRoute",
  "defineServiceRoutes",
  "defineTask",
  "defineJob",
  "defineEvent",
  "defineEventFunction",
  "defineBucket",
  "defineCache",
  "defineTool",
  "defineAgent",
  "defineGraph",
  "defineChannel",
  "defineTransform",
  "defineRequestTransform",
  "defineMiddleware",
  "defineService",
]);
const INDICATOR_ORDER: readonly AstCandidateIndicator[] = [
  "relkit-import",
  "factory",
  "default-export",
  "brand-access",
  "re-export",
];

/**
 * Matches a normalized source filename against compiler exclusion globs.
 * @param fileName - Portable filename relative to the project root.
 * @param patterns - Bun glob patterns, accepting either slash style.
 * @returns Whether any pattern excludes the filename.
 */
export function matchesExclude(fileName: string, patterns: readonly string[]): boolean {
  return runDiscoverySync(matchesExcludeEffect(fileName, patterns));
}

/**
 * Evaluates the compiler runtime's exclusion-glob capability lazily.
 * @param fileName - Portable filename relative to the project root.
 * @param patterns - Bun glob patterns, accepting either slash style.
 * @returns A lazy effect yielding whether any pattern excludes the filename.
 * @remarks Unexpected runtime/glob failures remain defects rather than skipping files.
 */
export const matchesExcludeEffect = Effect.fn("Discovery.matchesExclude")(
  function* (fileName: string, patterns: readonly string[]) {
    return patterns.some((pattern) => new Bun.Glob(pattern.replaceAll("\\", "/")).match(fileName));
  },
  (effect, _fileName, patterns) =>
    observeCompiler(
      "discovery",
      "matchesExclude",
      effect,
      () => ({ entries: patterns.length }),
      false,
    ),
);

/**
 * Runs a syntax scan for legacy synchronous callers.
 * @param fileName - Filename used by the parser and retained in the result.
 * @param text - Unevaluated source text.
 * @returns Candidate evidence, including an empty indicator list for ordinary files.
 */
export function scanSource(fileName: string, text: string): AstPrefilterCandidate {
  return runDiscoverySync(scanSourceEffect(fileName, text));
}

/**
 * Collects descriptor indicators and export identity facts without evaluating code.
 * @param fileName - Filename used to select TypeScript's parsing mode.
 * @param text - Unevaluated source text, including potentially incomplete syntax.
 * @returns A lazy effect yielding sorted, deduplicated syntax evidence.
 * @remarks TypeScript traversal callbacks synchronously mutate only this execution's
 * accumulators. Parser diagnostics do not fail discovery; facts remain syntax-only.
 */
export const scanSourceEffect = Effect.fn("Discovery.scanSource")(
  function* (fileName: string, text: string) {
    const source = ts.createSourceFile(
      fileName,
      text,
      ts.ScriptTarget.Latest,
      true,
      scriptKind(fileName),
    );
    const imports = new Set<string>();
    const factories = new Set<string>();
    const defaultExports = new Set<string>();
    const reExports: AstReExport[] = [];
    const indicators = new Set<AstCandidateIndicator>();
    let brandAccess = false;

    /**
     * Records one runtime RELKIT import.
     * @param specifier - Literal module specifier.
     * @returns Nothing; updates this scan's local evidence sets.
     */
    const addImport = (specifier: string): void => {
      if (!specifier.startsWith("@relkit/")) return;
      imports.add(specifier);
      indicators.add("relkit-import");
    };

    /**
     * Records runtime default-export evidence once.
     * @returns Nothing; updates this scan's local evidence sets.
     */
    const addDefaultExport = (): void => {
      defaultExports.add("default");
      indicators.add("default-export");
    };
    const nodes: ts.Node[] = [];

    /**
     * Collects external AST nodes in preorder.
     * @param node - Parsed node to visit.
     * @returns Nothing; appends to this execution's local node array.
     */
    const visit = (node: ts.Node): void => {
      nodes.push(node);
      ts.forEachChild(node, visit);
    };
    visit(source);
    yield* Effect.forEach(
      nodes,
      (node) =>
        Effect.gen(function* () {
          if (ts.isImportDeclaration(node) && isRuntimeImport(node)) {
            const specifier = node.moduleSpecifier;
            if (ts.isStringLiteralLike(specifier)) addImport(specifier.text);
          }
          if (ts.isExportDeclaration(node) && isRuntimeExport(node)) {
            const reExport = yield* readReExportEffect(node);
            if (reExport !== undefined) {
              reExports.push(reExport);
              indicators.add("re-export");
              addImport(reExport.moduleSpecifier);
              if (reExport.names.includes("default")) addDefaultExport();
            }
          }
          if (ts.isExportAssignment(node) && !node.isExportEquals) addDefaultExport();
          if (hasDefaultModifier(node)) addDefaultExport();
          if (ts.isIdentifier(node) && node.text === "RELKIT_DESCRIPTOR") {
            brandAccess = true;
            indicators.add("brand-access");
          }
          if (ts.isCallExpression(node)) {
            const factory = lastSegment(expressionName(node.expression));
            if (factory !== undefined && KNOWN_FACTORIES.has(factory)) {
              factories.add(factory);
              indicators.add("factory");
            }
            if (isDescriptorBrandCall(node)) {
              brandAccess = true;
              indicators.add("brand-access");
            }
            const moduleSpecifier = runtimeModuleSpecifier(node);
            if (moduleSpecifier !== undefined) addImport(moduleSpecifier);
          }
        }),
      { discard: true },
    );
    return Object.freeze({
      fileName,
      imports: Object.freeze([...imports].sort()),
      factories: Object.freeze([...factories].sort()),
      defaultExports: Object.freeze([...defaultExports].sort()),
      brandAccess,
      reExports: Object.freeze(
        reExports.sort((left, right) => left.moduleSpecifier.localeCompare(right.moduleSpecifier)),
      ),
      facts: yield* readFactsEffect(source),
      indicators: Object.freeze(INDICATOR_ORDER.filter((indicator) => indicators.has(indicator))),
    } satisfies AstPrefilterCandidate);
  },
  (effect, _fileName, text) =>
    observeCompiler(
      "discovery",
      "scanSource",
      effect,
      () => ({ files: 1, bytes: Buffer.byteLength(text, "utf8") }),
      false,
    ),
);
