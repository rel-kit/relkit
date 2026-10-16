/** Explicit pure descriptor construction; only native client lifecycle callbacks remain deferred. */
import ts from "typescript";
import { isLiteralSnapshotDefault } from "./snapshot-default-eligibility.js";

/** Validates the exact commerce constructors without granting general callback authority. */
export function assertCommerceCall(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, string>,
  pure: (expression: ts.Expression, bindings: ReadonlyMap<string, string>) => void,
): boolean {
  const target = expression.expression;
  if (!ts.isIdentifier(target)) return false;
  const binding = bindings.get(target.text);
  if (!["defineDrizzleService", "defineBetterAuthService", "defineError"].includes(binding ?? ""))
    return false;
  const options = expression.arguments[0];
  if (
    expression.arguments.length !== 1 ||
    options === undefined ||
    !ts.isObjectLiteralExpression(options)
  )
    throw new Error("Dynamic commerce descriptor");
  for (const property of options.properties) {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property))
      throw new Error("Dynamic commerce property");
    if (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name))
      throw new Error("Dynamic commerce key");
    const name = property.name.text;
    const value = ts.isPropertyAssignment(property) ? property.initializer : property.name;
    if (binding === "defineBetterAuthService") {
      if (!["baseURL", "emailAndPassword"].includes(name) || !isLiteralSnapshotDefault(value))
        throw new Error("Unaudited auth options");
    } else if (binding === "defineDrizzleService") {
      if (["client", "dispose"].includes(name)) {
        if (!ts.isArrowFunction(value) && !ts.isFunctionExpression(value))
          throw new Error("Eager database lifecycle");
      } else if (name === "schema" || name === "id") pure(value, bindings);
      else throw new Error("Unaudited database options");
    } else {
      if (!["id", "data", "message", "http"].includes(name))
        throw new Error("Unaudited error options");
      pure(value, bindings);
    }
  }
  return true;
}
