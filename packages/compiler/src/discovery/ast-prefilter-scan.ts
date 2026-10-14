/** Collects one module's syntax evidence without importing application code. */
import { Effect } from "effect";
import * as ts from "typescript";
import { readReExportEffect } from "./ast-prefilter-reexports.js";
import {
  expressionName,
  hasDefaultModifier,
  isDescriptorBrandCall,
  isRuntimeExport,
  isRuntimeImport,
  lastSegment,
  runtimeModuleSpecifier,
} from "./ast-prefilter-syntax.js";
import type { SourceScanState } from "./ast-prefilter-scan.types.js";
import type { AstCandidateIndicator } from "./ast-prefilter.types.js";
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
export const INDICATOR_ORDER: readonly AstCandidateIndicator[] = [
  "relkit-import",
  "factory",
  "default-export",
  "brand-access",
  "re-export",
];

/**
 * Returns preorder syntax nodes for sequential evidence collection.
 * @param source - Unevaluated parsed source.
 * @returns Source-ordered nodes, including ordinary helpers and re-exports.
 */
export function sourceScanNodes(source: ts.SourceFile): readonly ts.Node[] {
  const nodes: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    nodes.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return nodes;
}

/**
 * Creates isolated accumulators for one module syntax scan.
 * @returns Fresh mutable evidence owned by the scanning operation.
 */
export function sourceScanState(): SourceScanState {
  return {
    imports: new Set(),
    factories: new Set(),
    defaultExports: new Set(),
    reExports: [],
    indicators: new Set(),
    brandAccess: false,
  };
}

/**
 * Collects one source node, retaining typed re-export parsing failures.
 * @param state - Invocation-local syntax evidence.
 * @param node - Next unevaluated syntax node.
 * @returns Lazy completion, preserving unexpected parser defects.
 */
export const scanSourceNode = Effect.fn("Discovery.scanSourceNode")(function* (
  state: SourceScanState,
  node: ts.Node,
) {
  if (ts.isImportDeclaration(node) && isRuntimeImport(node)) {
    const specifier = node.moduleSpecifier;
    if (ts.isStringLiteralLike(specifier)) addImport(state, specifier.text);
  }
  if (ts.isExportDeclaration(node) && isRuntimeExport(node)) {
    const reExport = yield* readReExportEffect(node);
    if (reExport !== undefined) {
      state.reExports.push(reExport);
      state.indicators.add("re-export");
      addImport(state, reExport.moduleSpecifier);
      if (reExport.names.includes("default")) addDefaultExport(state);
    }
  }
  if (ts.isExportAssignment(node) && !node.isExportEquals) addDefaultExport(state);
  if (hasDefaultModifier(node)) addDefaultExport(state);
  if (ts.isIdentifier(node) && node.text === "RELKIT_DESCRIPTOR") {
    state.brandAccess = true;
    state.indicators.add("brand-access");
  }
  if (ts.isCallExpression(node)) {
    const factory = lastSegment(expressionName(node.expression));
    if (factory !== undefined && KNOWN_FACTORIES.has(factory)) {
      state.factories.add(factory);
      state.indicators.add("factory");
    }
    if (isDescriptorBrandCall(node)) {
      state.brandAccess = true;
      state.indicators.add("brand-access");
    }
    const moduleSpecifier = runtimeModuleSpecifier(node);
    if (moduleSpecifier !== undefined) addImport(state, moduleSpecifier);
  }
});

/**
 * Registers an authored RELKIT dependency in this module's syntax evidence.
 * @param state - Current invocation-local scan state.
 * @param specifier - Literal dependency name.
 * @returns No value.
 */
function addImport(state: SourceScanState, specifier: string): void {
  if (!specifier.startsWith("@relkit/")) return;
  state.imports.add(specifier);
  state.indicators.add("relkit-import");
}

/**
 * Registers runtime default-export evidence once for this module.
 * @param state - Current invocation-local scan state.
 * @returns No value.
 */
function addDefaultExport(state: SourceScanState): void {
  state.defaultExports.add("default");
  state.indicators.add("default-export");
}
