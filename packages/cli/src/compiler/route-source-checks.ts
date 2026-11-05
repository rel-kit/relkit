import ts from "../typescript-parser.js";

export const ROUTE_MODULE_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "ALL",
]);

export interface RouteSourceFinding {
  readonly node: ts.Node;
  readonly message: string;
}

export function isRouteModule(file: string): boolean {
  const route = /(?:^|\/)(src\/routes\/(?:.*\/)?route\.ts)$/.exec(file.replaceAll("\\", "/"))?.[1];
  return route !== undefined && !/\/__(?:tests|fixtures)__\//.test(route);
}

/** Pure source rules shared by normalization and the TypeScript editor plugin. */
export function routeSourceFindings(
  source: ts.SourceFile,
  typescript: typeof ts = ts,
): readonly RouteSourceFinding[] {
  if (!isRouteModule(source.fileName)) return [];
  const functions = new Set<string>();
  const namespaces = new Set<string>();
  for (const statement of source.statements) {
    if (
      !typescript.isImportDeclaration(statement) ||
      !typescript.isStringLiteral(statement.moduleSpecifier)
    )
      continue;
    if (
      !["relkit/routes", "relkit", "@relkit/app/routes", "@relkit/app"].includes(
        statement.moduleSpecifier.text,
      )
    )
      continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && typescript.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
    if (bindings && typescript.isNamedImports(bindings)) {
      for (const entry of bindings.elements) {
        if ((entry.propertyName ?? entry.name).text === "defineServiceRoutes")
          functions.add(entry.name.text);
      }
    }
  }
  const findings: RouteSourceFinding[] = [];
  for (const statement of source.statements) {
    if (!typescript.isVariableStatement(statement)) continue;
    const exported = statement.modifiers?.some(
      (modifier) => modifier.kind === typescript.SyntaxKind.ExportKeyword,
    );
    for (const declaration of statement.declarationList.declarations) {
      let initializer = declaration.initializer;
      while (
        initializer &&
        (typescript.isParenthesizedExpression(initializer) ||
          typescript.isSatisfiesExpression(initializer) ||
          typescript.isAsExpression(initializer))
      ) {
        initializer = initializer.expression;
      }
      if (!initializer || !typescript.isCallExpression(initializer)) continue;
      const callee = initializer.expression;
      const serviceRoutes = typescript.isIdentifier(callee)
        ? functions.has(callee.text)
        : typescript.isPropertyAccessExpression(callee) &&
          typescript.isIdentifier(callee.expression) &&
          namespaces.has(callee.expression.text) &&
          callee.name.text === "defineServiceRoutes";
      if (!serviceRoutes) continue;
      if (!exported || !typescript.isObjectBindingPattern(declaration.name)) {
        findings.push({
          node: declaration.name,
          message:
            "defineServiceRoutes returns a method table. Export it from the route module with `export default defineServiceRoutes(...)`.",
        });
        continue;
      }
      for (const element of declaration.name.elements) {
        const property = element.propertyName ?? element.name;
        if (
          element.dotDotDotToken ||
          !typescript.isIdentifier(property) ||
          !typescript.isIdentifier(element.name) ||
          property.text !== element.name.text ||
          property.text === "ALL" ||
          !ROUTE_MODULE_METHODS.has(property.text)
        ) {
          findings.push({
            node: element,
            message: "Service route exports cannot use aliases, rest bindings, or invalid methods.",
          });
        }
      }
    }
  }
  return findings;
}
