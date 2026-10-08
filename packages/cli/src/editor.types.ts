import type ts from "typescript";

/** TypeScript implementation injected by the editor; never import a second runtime copy. */
export interface EditorModules {
  readonly typescript: typeof ts;
}
