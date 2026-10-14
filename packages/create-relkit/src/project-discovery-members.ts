/**
 * Reads public service member bindings from compiler facts or a compatible
 * TypeScript object declaration. This pure syntax adapter never evaluates member
 * expressions or creates a runtime service; ownership is resolved separately.
 */
import * as ts from "typescript";
import { readFactoryObject, staticPropertyName } from "./source-edit.js";

/**
 * Extracts callable/event/task/job member names from a service declaration.
 * @param facts - Compiler-recognized member bindings, when available.
 * @param source - Complete owning module source text.
 * @param path - Physical module path supplying source coordinates.
 * @param factory - Recognized service factory name.
 * @returns Static member names and their optional identifiable target bindings.
 */
export function serviceMembers(
  facts: readonly { readonly member: string; readonly targetBinding?: string }[],
  source: string,
  path: string,
  factory: string,
) {
  if (facts.length > 0)
    return facts.map((member) => ({
      name: member.member,
      ...(member.targetBinding === undefined ? {} : { targetBinding: member.targetBinding }),
    }));
  const root = readFactoryObject(source, path, [factory]);
  return ["functions", "events", "tasks", "jobs"].flatMap((category) => {
    const item = root.properties.find((item) => staticPropertyName(item.name) === category);
    if (!item || !ts.isPropertyAssignment(item)) return [];
    const value = unwrap(item.initializer);
    if (!value || !ts.isObjectLiteralExpression(value)) return [];
    return value.properties.flatMap((member) => {
      const name = staticPropertyName(member.name);
      if (name === undefined) return [];
      let targetBinding: string | undefined;
      if (ts.isShorthandPropertyAssignment(member)) targetBinding = member.name.text;
      else if (ts.isPropertyAssignment(member) && ts.isIdentifier(member.initializer))
        targetBinding = member.initializer.text;
      return [{ name, ...(targetBinding === undefined ? {} : { targetBinding }) }];
    });
  });
}

/**
 * Removes syntax-only wrappers while leaving expressions unevaluated.
 * @param value - Optional source expression wrapped by assertions or parentheses.
 * @returns Underlying expression, or absence when no expression was supplied.
 */
function unwrap(value: ts.Expression | undefined): ts.Expression | undefined {
  if (!value) return undefined;
  if (
    ts.isAsExpression(value) ||
    ts.isSatisfiesExpression(value) ||
    ts.isParenthesizedExpression(value)
  )
    return unwrap(value.expression);
  return value;
}
