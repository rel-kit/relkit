export interface InputTree {
  readonly fields: Map<string, InputField>;
}

export function addInputField(
  tree: InputTree,
  path: readonly string[],
  type: string,
  options: { readonly optional: boolean },
): void {
  const key = path[0];
  if (key === undefined) return;
  const field = tree.fields.get(key) ?? { optional: options.optional, type };
  if (path.length === 1) {
    field.optional = field.optional && options.optional;
    field.type = type;
  } else {
    field.children ??= { fields: new Map() };
    addInputField(field.children, path.slice(1), type, options);
  }
  tree.fields.set(key, field);
}

export function renderInputTree(tree: InputTree): string {
  const entries = [...tree.fields.entries()].sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return "{}";
  return `{ ${entries
    .map(([key, field]) => {
      const value = field.children === undefined ? field.type : renderInputTree(field.children);
      return `${JSON.stringify(key)}${field.optional ? "?" : ""}: ${value}`;
    })
    .join("; ")} }`;
}

interface InputField {
  optional: boolean;
  type: string;
  children?: InputTree;
}
