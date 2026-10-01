import ts from "typescript";
import { createDiagnostic, type Diagnostic } from "@relkit/diagnostics";
import { missingRoutePathInputs } from "./route-path-input-checks.js";
import {
  isRouteModule,
  ROUTE_MODULE_METHODS,
  type RouteSourceFinding,
} from "./route-source-checks.js";

/** Checks exported values without evaluating user code, including aliases and reexports. */
export function routeModuleFindings(
  program: ts.Program,
  source: ts.SourceFile,
  typescript: typeof ts = ts,
): readonly RouteSourceFinding[] {
  if (!isRouteModule(source.fileName) || source.isDeclarationFile) return [];
  const checker = program.getTypeChecker();
  const module = checker.getSymbolAtLocation(source);
  const contract = expectedModule(program, checker, module, typescript);
  const exports = module ? checker.getTypeOfSymbolAtLocation(module, source).getProperties() : [];
  const findings: RouteSourceFinding[] = [];
  let methods = 0;
  for (const entry of exports) {
    const symbol =
      (entry.flags & typescript.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(entry) : entry;
    if ((symbol.flags & typescript.SymbolFlags.Value) === 0) continue;
    const node = entry.declarations?.find((node) => node.getSourceFile() === source) ?? source;
    const type = checker.getTypeOfSymbolAtLocation(symbol, node);
    if (!ROUTE_MODULE_METHODS.has(entry.name)) {
      findings.push({
        node,
        message: `Route modules must export named HTTP methods; "${entry.name}" is not a supported method.`,
      });
      continue;
    }
    methods++;
    const missing = missingRoutePathInputs(type, node, checker, source.fileName, typescript);
    if (missing.length > 0) {
      findings.push({
        node,
        message: `Route ${entry.name} infers path input ${missing.map((name) => `"${name}"`).join(", ")}, but the target function input schema does not declare it. Add the input field or define an explicit request mapping.`,
      });
      continue;
    }
    const expected = contract?.getProperty(entry.name);
    const valid =
      isRoute(type, node, checker, entry.name === "ALL", typescript) &&
      (!expected ||
        checker.isTypeAssignableTo(type, checker.getTypeOfSymbolAtLocation(expected, node)));
    if (!valid) {
      findings.push({
        node,
        message: `Route export ${entry.name} must be a typed route descriptor, not a method table, handler, or untyped value.`,
      });
    }
  }
  if (methods === 0)
    findings.push({
      node: source,
      message: "Route modules must export at least one named HTTP method.",
    });
  return findings;
}

function expectedModule(
  program: ts.Program,
  checker: ts.TypeChecker,
  module: ts.Symbol | undefined,
  typescript: typeof ts,
): ts.Type | undefined {
  if (!module) return undefined;
  for (const source of program.getSourceFiles()) {
    if (!source.fileName.endsWith("/route-module-checks.ts")) continue;
    for (const statement of source.statements) {
      if (
        !typescript.isTypeAliasDeclaration(statement) ||
        !typescript.isTypeReferenceNode(statement.type) ||
        statement.type.typeName.getText(source) !== "AssertModule"
      )
        continue;
      const [expected, actual] = statement.type.typeArguments ?? [];
      if (expected && actual && checker.getTypeFromTypeNode(actual).getSymbol() === module) {
        return checker.getTypeFromTypeNode(expected);
      }
    }
  }
  return undefined;
}

function isRoute(
  type: ts.Type,
  node: ts.Node,
  checker: ts.TypeChecker,
  raw: boolean,
  typescript: typeof ts,
): boolean {
  if (
    (type.flags &
      (typescript.TypeFlags.Any | typescript.TypeFlags.Unknown | typescript.TypeFlags.Never)) !==
    0
  )
    return false;
  if (type.isUnion())
    return type.types.every((member) => isRoute(member, node, checker, raw, typescript));
  const kind = type.getProperty("kind");
  if (!kind) return false;
  const value = checker.getTypeOfSymbolAtLocation(kind, node);
  if (!value.isStringLiteral() || value.value !== "route") return false;
  return raw
    ? type.getProperty("raw") !== undefined && type.getProperty("handler") !== undefined
    : type.getProperty("target") !== undefined || type.getProperty("handler") !== undefined;
}

export function routeModuleDiagnostics(
  program: ts.Program,
  source: ts.SourceFile,
  projectRoot?: string,
): readonly Diagnostic[] {
  return routeModuleFindings(program, source).map(({ node, message }) => {
    const location = source.getLineAndCharacterOfPosition(node.getStart(source));
    return createDiagnostic(
      {
        code: "RELKIT_ROUTE_MODULE_TYPE",
        severity: "error",
        message,
        file: source.fileName,
        line: location.line + 1,
        column: location.character + 1,
      },
      projectRoot === undefined ? {} : { projectRoot },
    );
  });
}
