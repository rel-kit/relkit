/** Mutable tree assembled from request mapping paths.
 * @example const tree: InputTree = { fields: new Map() };
 */
export interface InputTree {
  readonly fields: Map<string, InputField>;
}

/** Internal node of an input type tree.
 * @example const field: InputField = { optional: false, type: "string" };
 */
export interface InputField {
  optional: boolean;
  type: string;
  children?: InputTree;
}
