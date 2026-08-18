import * as ts from "typescript";
import type { AstCandidateIndicator, AstPrefilterCandidate, AstReExport } from "./ast-prefilter.js";

const KNOWN_FACTORIES = new Set([
  "defineApp",
  "defineFunction",
  "defineRoute",
  "defineJob",
  "defineEvent",
  "onEvent",
  "defineBucket",
  "defineCache",
  "defineTool",
  "defineAgent",
  "defineTransform",
  "defineRequestTransform",
]);

const INDICATOR_ORDER: readonly AstCandidateIndicator[] = [
  "zsys-import",
  "factory",
  "default-export",
  "brand-access",
  "re-export",
];

export function matchesExclude(fileName: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => new Bun.Glob(pattern.replaceAll("\\", "/")).match(fileName));
}

export function scanSource(fileName: string, text: string): AstPrefilterCandidate {
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

  const addImport = (specifier: string): void => {
    if (!specifier.startsWith("@zsys/")) return;
    imports.add(specifier);
    indicators.add("zsys-import");
  };
  const addDefaultExport = (): void => {
    defaultExports.add("default");
    indicators.add("default-export");
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && isRuntimeImport(node)) {
      const specifier = node.moduleSpecifier;
      if (ts.isStringLiteralLike(specifier)) addImport(specifier.text);
    }
    if (ts.isExportDeclaration(node) && isRuntimeExport(node)) {
      const reExport = readReExport(node);
      if (reExport !== undefined) {
        reExports.push(reExport);
        indicators.add("re-export");
        addImport(reExport.moduleSpecifier);
        if (reExport.names.includes("default")) addDefaultExport();
      }
    }
    if (ts.isExportAssignment(node) && !node.isExportEquals) addDefaultExport();
    if (hasDefaultModifier(node)) addDefaultExport();
    if (ts.isIdentifier(node) && node.text === "ZSYS_DESCRIPTOR") {
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
    ts.forEachChild(node, visit);
  };
  visit(source);

  return Object.freeze({
    fileName,
    imports: Object.freeze([...imports].sort()),
    factories: Object.freeze([...factories].sort()),
    defaultExports: Object.freeze([...defaultExports].sort()),
    brandAccess,
    reExports: Object.freeze(
      reExports.sort((left, right) => left.moduleSpecifier.localeCompare(right.moduleSpecifier)),
    ),
    indicators: Object.freeze(INDICATOR_ORDER.filter((indicator) => indicators.has(indicator))),
  });
}

function isRuntimeImport(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (clause === undefined || clause.isTypeOnly) return clause === undefined;
  if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
    return clause.namedBindings.elements.some((element) => !element.isTypeOnly);
  }
  return true;
}

function isRuntimeExport(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) return false;
  if (!node.exportClause || ts.isNamespaceExport(node.exportClause)) return true;
  return node.exportClause.elements.some((element) => !element.isTypeOnly);
}

function readReExport(node: ts.ExportDeclaration): AstReExport | undefined {
  if (!node.moduleSpecifier || !ts.isStringLiteralLike(node.moduleSpecifier)) return undefined;
  if (!node.exportClause)
    return { moduleSpecifier: node.moduleSpecifier.text, names: ["*"], exportAll: true };
  if (!ts.isNamedExports(node.exportClause)) return undefined;
  const names = node.exportClause.elements
    .filter((element) => !element.isTypeOnly)
    .map((element) => element.name.text);
  return names.length === 0
    ? undefined
    : {
        moduleSpecifier: node.moduleSpecifier.text,
        names: [...new Set(names)].sort(),
        exportAll: false,
      };
}

function isDescriptorBrandCall(node: ts.CallExpression): boolean {
  const argument = node.arguments[0];
  return (
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "Symbol" &&
    node.expression.name.text === "for" &&
    node.arguments.length === 1 &&
    argument !== undefined &&
    ts.isStringLiteralLike(argument) &&
    argument.text === "zsys.descriptor"
  );
}

function runtimeModuleSpecifier(node: ts.CallExpression): string | undefined {
  const argument = node.arguments[0];
  if (
    !(
      node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === "require")
    ) ||
    node.arguments.length !== 1 ||
    argument === undefined ||
    !ts.isStringLiteralLike(argument)
  )
    return undefined;
  return argument.text;
}

function expressionName(expression: ts.Expression): string {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) {
    const parent = expressionName(expression.expression);
    return parent === "" ? expression.name.text : `${parent}.${expression.name.text}`;
  }
  return "";
}

function lastSegment(value: string): string | undefined {
  const segment = value.split(".").at(-1);
  return segment === "" ? undefined : segment;
}

function hasDefaultModifier(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) ===
      true
  );
}

function scriptKind(fileName: string): ts.ScriptKind {
  if (fileName.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (fileName.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (fileName.endsWith(".json")) return ts.ScriptKind.JSON;
  return ts.ScriptKind.TS;
}
