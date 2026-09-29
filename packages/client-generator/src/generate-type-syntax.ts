import { Effect } from "effect";
import type { TypePropertyOptions } from "./generate-type-syntax.types.js";
/** Renders a property in a TypeScript object type.
 * @param name - Property name or quoted property literal.
 * @param type - Rendered property type.
 * @param options - Optional and readonly modifiers; properties are readonly by default.
 * @returns An Effect yielding one object type member with no expected failure.
 * @example Effect.runSync(renderTypePropertyEffect("id", "string"));
 */
export const renderTypePropertyEffect = Effect.fnUntraced(function* (
  name: string,
  type: string,
  options: TypePropertyOptions = {},
) {
  const readonly = options.readonly === false ? "" : "readonly ";
  const optional = options.optional === true ? "?" : "";
  return `${readonly}${name}${optional}: ${type}`;
});
/** Renders already-formatted members as a TypeScript object type.
 * @param members - Object type members in declaration order.
 * @returns An Effect yielding an inline object type with no expected failure.
 * @example Effect.runSync(renderTypeObjectEffect([]));
 */
export const renderTypeObjectEffect = Effect.fnUntraced(function* (members: readonly string[]) {
  if (members.length === 0) return "{}";
  return `{ ${members.join("; ")} }`;
});
/** Renders alternatives as a TypeScript union, or `never` for no alternatives.
 * @param alternatives - Rendered type alternatives in declaration order.
 * @returns An Effect yielding a union or `never` with no expected failure.
 * @example Effect.runSync(renderTypeUnionEffect(["string", "number"]));
 */
export const renderTypeUnionEffect = Effect.fnUntraced(function* (alternatives: readonly string[]) {
  return alternatives.join(" | ") || "never";
});
/** Renders a TypeScript generic type application.
 * @param name - Type name, including any module qualifier.
 * @param arguments_ - Rendered generic arguments in declaration order.
 * @returns An Effect yielding a generic type expression with no expected failure.
 * @example Effect.runSync(renderTypeApplicationEffect("ReadonlyArray", ["string"]));
 */
export const renderTypeApplicationEffect = Effect.fnUntraced(function* (
  name: string,
  arguments_: readonly string[],
) {
  return `${name}<${arguments_.join(", ")}>`;
});
/** Renders an intersection of two TypeScript types.
 * @param left - First rendered type.
 * @param right - Second rendered type.
 * @returns An Effect yielding an intersection type with no expected failure.
 * @example Effect.runSync(renderTypeIntersectionEffect("A", "B"));
 */
export const renderTypeIntersectionEffect = Effect.fnUntraced(function* (
  left: string,
  right: string,
) {
  return `${left} & ${right}`;
});
/** Renders a readonly tuple of TypeScript types.
 * @param elements - Rendered tuple elements in declaration order.
 * @returns An Effect yielding a readonly tuple type with no expected failure.
 * @example Effect.runSync(renderReadonlyTypeTupleEffect(["string", "number"]));
 */
export const renderReadonlyTypeTupleEffect = Effect.fnUntraced(function* (
  elements: readonly string[],
) {
  return `readonly [${elements.join(", ")}]`;
});
