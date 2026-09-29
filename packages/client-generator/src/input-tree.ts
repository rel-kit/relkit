import { Effect } from "effect";
import { makeGeneratorOperation } from "./generator-operation.js";
import type { InputField, InputTree } from "./input-tree.types.js";
export type { InputTree } from "./input-tree.types.js";
/** Adds one mapped field to the mutable input tree.
 * @param tree - Mutable input tree.
 * @param path - Nested input field path.
 * @param type - Rendered leaf type.
 * @param options - Field optionality.
 * @returns An Effect updating the tree; it has no expected failure.
 * @example Effect.runSync(inputTreeCalculations.addEffect({ fields: new Map() }, ["id"], "string", { optional: false }));
 */
const addInputFieldCore: (
  tree: InputTree,
  path: readonly string[],
  type: string,
  options: { readonly optional: boolean },
) => Effect.Effect<void> = Effect.fnUntraced(function* (
  tree: InputTree,
  path: readonly string[],
  type: string,
  options: { readonly optional: boolean },
) {
  const key = path[0];
  if (key === undefined) return;
  const field = tree.fields.get(key) ?? { optional: options.optional, type };
  if (path.length === 1) {
    field.optional = field.optional && options.optional;
    field.type = type;
  } else {
    field.children ??= { fields: new Map() };
    yield* addInputFieldCore(field.children, path.slice(1), type, options);
  }
  tree.fields.set(key, field);
});
/** Renders a nested input tree as a readonly TypeScript object type.
 * @param tree - Mutable input tree.
 * @returns An Effect yielding the rendered object type; it has no expected failure.
 * @example Effect.runSync(inputTreeCalculations.renderEffect({ fields: new Map() }));
 */
const renderInputTreeCore: (tree: InputTree) => Effect.Effect<string> = Effect.fnUntraced(
  function* (tree: InputTree) {
    const entries = [...tree.fields.entries()].sort(([left], [right]) => left.localeCompare(right));
    if (entries.length === 0) return "{}";
    const fields: string[] = [];
    for (const [key, field] of entries) {
      const value =
        field.children === undefined ? field.type : yield* renderInputTreeCore(field.children);
      fields.push(`${JSON.stringify(key)}${field.optional ? "?" : ""}: ${value}`);
    }
    return `{ ${fields.join("; ")} }`;
  },
);
const addInputFieldOperation = makeGeneratorOperation("addInputField", addInputFieldCore);
/** Adds a mapped field to the nested generated input type tree.
 * @param tree - Mutable input tree.
 * @param path - Property or route path.
 * @param type - TypeScript type text.
 * @param options - Field optionality.
 * @returns An Effect with the rendered result and no expected typed failures.
 * @example Effect.runSync(addInputFieldEffect(tree, path, type, options));
 */
export const addInputFieldEffect = addInputFieldOperation.effect;
/** Adds a field to the input tree for synchronous compiler callers.
 * @param tree - Mutable input tree.
 * @param path - Property or route path.
 * @param type - TypeScript type text.
 * @param options - Field optionality.
 * @returns The rendered result.
 * @throws If malformed trusted input causes a defect.
 * @example addInputField(tree, path, type, options);
 */
export const addInputField = addInputFieldOperation.run;
const renderInputTreeOperation = makeGeneratorOperation("renderInputTree", renderInputTreeCore);
/** Renders nested input fields as a readonly TypeScript object type.
 * @param tree - Mutable input tree.
 * @returns An Effect with the rendered result and no expected typed failures.
 * @example Effect.runSync(renderInputTreeEffect(tree));
 */
export const renderInputTreeEffect = renderInputTreeOperation.effect;
/** Renders the input tree for synchronous compiler callers.
 * @param tree - Mutable input tree.
 * @returns The rendered result.
 * @throws If malformed trusted input causes a defect.
 * @example renderInputTree(tree);
 */
export const renderInputTree = renderInputTreeOperation.run;
/** Input tree calculations shared by composed generator operations. @internal */
export const inputTreeCalculations = {
  add: addInputFieldOperation.run,
  addEffect: addInputFieldCore,
  render: renderInputTreeOperation.run,
  renderEffect: renderInputTreeCore,
} as const;
