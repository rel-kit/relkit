import type ts from "./typescript-parser.js";

/** TypeScript implementation injected by the editor; never import a second runtime copy. */
export interface EditorModules {
  readonly typescript: typeof ts;
}
