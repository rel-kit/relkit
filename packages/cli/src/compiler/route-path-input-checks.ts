import ts from "typescript";
import { routePathParameters } from "./route-path-parameters.js";

/** Checks raw schema input keys; explicit mappings can rename path parameters. */
export function missingRoutePathInputs(
  route: ts.Type,
  node: ts.Node,
  checker: ts.TypeChecker,
  file: string,
  typescript: typeof ts = ts,
): readonly string[] {
  const parameters = routePathParameters(file);
  if (parameters.length === 0) return [];
  const target = property(route, "target", node, checker);
  if (!target) return [];
  const request = property(route, "request", node, checker);
  if (request && (checker.getNonNullableType(request).flags & typescript.TypeFlags.Never) === 0)
    return [];
  const schema = property(target, "input", node, checker);
  const standard = schema && property(schema, "~standard", node, checker);
  const types = standard && property(standard, "types", node, checker);
  const input = types && property(types, "input", node, checker);
  return input ? parameters.filter((name) => !input.getProperty(name)) : [];
}

function property(
  type: ts.Type,
  name: string,
  node: ts.Node,
  checker: ts.TypeChecker,
): ts.Type | undefined {
  const symbol = checker.getNonNullableType(type).getProperty(name);
  return symbol
    ? checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(symbol, node))
    : undefined;
}
