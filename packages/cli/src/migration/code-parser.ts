/**
 * The one TypeScript parser that `relkit migrate` codemods use. Every rule imports the syntax
 * namespace and the parse function from here, never from `typescript` directly, so replacing
 * the parser (for example with the CLI's bundled private TypeScript) changes only this file.
 * Parsing is syntax-only: no program, type checker or file system access, so a codemod never
 * runs or resolves application code.
 */
import * as codeSyntax from "typescript";

export { codeSyntax };

/** A parsed source file; rules walk it with `codeSyntax` node guards. */
export type CodeSource = codeSyntax.SourceFile;

/**
 * Parses one authored module with the script kind its extension implies.
 * @param path - Project-relative path; its extension selects TS, TSX, JS or JSX parsing.
 * @param text - Complete module text.
 * @returns A syntax tree with parent pointers set, ready for node position lookups.
 */
export function parseCodeSource(path: string, text: string): CodeSource {
  return codeSyntax.createSourceFile(
    path,
    text,
    codeSyntax.ScriptTarget.Latest,
    true,
    scriptKind(path),
  );
}

/**
 * Maps a file extension to the TypeScript script kind, defaulting to TS.
 * @param path - Project-relative module path.
 * @returns The script kind used for parsing.
 */
function scriptKind(path: string): codeSyntax.ScriptKind {
  if (/\.tsx$/.test(path)) return codeSyntax.ScriptKind.TSX;
  if (/\.jsx$/.test(path)) return codeSyntax.ScriptKind.JSX;
  if (/\.[cm]?js$/.test(path)) return codeSyntax.ScriptKind.JS;
  return codeSyntax.ScriptKind.TS;
}
