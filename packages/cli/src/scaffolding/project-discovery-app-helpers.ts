/** Reads static app AST values without evaluating authored source. */
import * as ts from "typescript";
import { staticPropertyName } from "./source-edit.js";
/**
 * Finds a statically named app configuration property.
 * @param object - App configuration object-literal AST.
 * @param name - Authored name or declaration key.
 * @returns The matching property, or undefined when absent.
 */
export function objectProperty(object: ts.ObjectLiteralExpression, name: string) {
  return object.properties.find((item) => staticPropertyName(item.name) === name);
}
/**
 * Reads the capability property, including the jobs/job alias.
 * @param object - App configuration object-literal AST.
 * @param capability - Requested provider capability.
 * @returns The matching capability declaration, or undefined when absent.
 */
export function profileProperty(object: ts.ObjectLiteralExpression, capability: string) {
  return capability === "job"
    ? (objectProperty(object, "jobs") ?? objectProperty(object, "job"))
    : objectProperty(object, capability);
}
/**
 * Reads a statically declared object-valued property.
 * @param object - Owning object-literal AST.
 * @param name - Authored name or declaration key.
 * @returns The unwrapped object literal, or undefined for absent/nonliteral values.
 */
export function objectPropertyObject(object: ts.ObjectLiteralExpression, name: string) {
  const item = objectProperty(object, name);
  const value = item && ts.isPropertyAssignment(item) ? unwrap(item.initializer) : undefined;
  return value && ts.isObjectLiteralExpression(value) ? value : undefined;
}
/**
 * Reads one literal default selection from app configuration.
 * @param object - Object-literal AST whose properties are inspected.
 * @param name - Authored name or declaration key.
 * @returns The declared string default, or undefined for absent/nonliteral properties.
 */
export function defaultValue(
  object: ts.ObjectLiteralExpression | undefined,
  name: string,
): string | undefined {
  const item = object && objectProperty(object, name);
  return item && ts.isPropertyAssignment(item) && ts.isStringLiteralLike(item.initializer)
    ? item.initializer.text
    : undefined;
}
/**
 * Reads static constructor names, including nested adapter wrappers.
 * @param call - Call-expression AST inspected without evaluation.
 * @returns The static adapter name including nested constructor names, or undefined for dynamic calls.
 */
export function callName(call: ts.CallExpression): string | undefined {
  const name = ts.isIdentifier(call.expression)
    ? call.expression.text
    : ts.isPropertyAccessExpression(call.expression)
      ? call.expression.name.text
      : undefined;
  if (name === undefined) return undefined;
  const nested = call.arguments
    .map((argument) => unwrap(argument))
    .find(
      (argument): argument is ts.CallExpression =>
        argument !== undefined && ts.isCallExpression(argument),
    );
  const nestedName = nested === undefined ? undefined : callName(nested);
  return nestedName === undefined ? name : `${name}(${nestedName})`;
}
/**
 * Reads one literal option from a constructor's first object argument.
 * @param call - Call-expression AST inspected without evaluation.
 * @param name - Authored name or declaration key.
 * @returns The string option from the first object argument, or undefined when nonliteral or absent.
 */
export function callStringOption(call: ts.CallExpression, name: string): string | undefined {
  const value = unwrap(call.arguments[0]);
  if (!value || !ts.isObjectLiteralExpression(value)) return undefined;
  const item = objectProperty(value, name);
  return item && ts.isPropertyAssignment(item) && ts.isStringLiteralLike(item.initializer)
    ? item.initializer.text
    : undefined;
}
/**
 * Removes parentheses and TypeScript assertions from a source expression.
 * @param value - AST expression whose static wrapper nodes are ignored.
 * @returns The underlying expression, or undefined when no expression was supplied.
 */
export function unwrap(value: ts.Expression | undefined): ts.Expression | undefined {
  return value &&
    (ts.isAsExpression(value) ||
      ts.isSatisfiesExpression(value) ||
      ts.isParenthesizedExpression(value))
    ? unwrap(value.expression)
    : value;
}
/**
 * Omits absent fields when constructing a public result.
 * @typeParam Name - Literal property key retained in the mapped result.
 * @typeParam Value - Value type retained for the optional property.
 * @param name - Result property key.
 * @param value - Defined property value or undefined to omit it.
 * @returns An empty object for undefined, otherwise an object containing the named field.
 */
export function optional<Name extends string, Value>(
  name: Name,
  value: Value | undefined,
): { readonly [Key in Name]?: Value } {
  return value === undefined ? {} : ({ [name]: value } as { readonly [Key in Name]: Value });
}
