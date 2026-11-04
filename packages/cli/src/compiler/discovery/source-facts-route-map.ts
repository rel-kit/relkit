import * as ts from "typescript";
import type { ExportFact, FactoryBindingFact } from "./source-facts.types.js";

const MAP_METHODS: ReadonlySet<string> = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

/**
 * Lists the route exports a default-exported `defineServiceRoutes` map provides, one per method key,
 * so each method gets the same identity evidence as a destructured export.
 * @param expression - The default export's expression.
 * @param factory - The factory evidence found for that expression.
 * @param sourceFile - Source that holds the expression.
 * @returns Method names paired with their export evidence.
 */
export function serviceRouteMapExports(
  expression: ts.Expression,
  factory: FactoryBindingFact | undefined,
  sourceFile: ts.SourceFile,
): readonly (readonly [string, ExportFact])[] {
  if (factory?.factory !== "defineServiceRoutes" || !ts.isCallExpression(expression)) return [];
  const map = expression.arguments[1];
  if (map === undefined || !ts.isObjectLiteralExpression(map)) return [];
  return map.properties.flatMap((property) => {
    const name =
      property.name !== undefined &&
      (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
        ? property.name.text
        : undefined;
    if (name === undefined || !MAP_METHODS.has(name)) return [];
    const position = property.getStart(sourceFile);
    const routeFactory = Object.freeze({ ...factory, binding: name, position });
    return [[name, { position, binding: name, factory: routeFactory }] as const];
  });
}
