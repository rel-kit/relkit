/**
 * Rule `error-ids`: an error's ID is its public code, and 0.9 requires it to be explicit.
 * Earlier versions inferred it from the source path and the error's binding name; the rule
 * writes exactly that inferred ID (through the compiler's own `encodeErrorId`) as the first
 * option, so public error codes do not change. An error without a binding name had no stable
 * inferred ID and is reported.
 */
import { codeSyntax as ts, parseCodeSource } from "../code-parser.js";
import {
  applyTextEdits,
  findingAt,
  insertFirst,
  objectProperty,
  type TextEdit,
} from "../code-edits.js";
import { encodeErrorId } from "../../compiler/discovery/source-id.js";
import type { CodeFinding, CodeRule } from "../code-migration.types.js";
import { defineCalls, relkitLocals } from "./rule-support.js";

const id = "error-ids";

export const errorIdsRule: CodeRule = {
  id,
  summary: "Write the previously inferred ID on every defineError",
  guide: "error-ids",
  appliesTo: (path) => /\.[cm]?[jt]sx?$/.test(path) && !/\.d\.[cm]?ts$/.test(path),
  apply: (file, context) => {
    const source = parseCodeSource(file.path, file.text);
    const edits: TextEdit[] = [];
    const findings: CodeFinding[] = [];
    for (const { call, options } of defineCalls(source, relkitLocals(source, "defineError"))) {
      if (objectProperty(options, "id") !== undefined) continue;
      const binding = bindingName(call);
      const inferred =
        binding === undefined
          ? undefined
          : encodeErrorId(file.path, binding, undefined, context.root);
      if (inferred === undefined) {
        findings.push(
          findingAt(
            source,
            call,
            id,
            "This error has no binding name, so it had no stable code; add an explicit id.",
          ),
        );
        continue;
      }
      edits.push(insertFirst(source, options, `id: ${JSON.stringify(inferred)}`));
    }
    return { text: applyTextEdits(file.text, edits), findings };
  },
};

/**
 * Reads the variable a `defineError(...)` call is assigned to.
 * @param call - The call expression.
 * @returns The binding name, if the call initializes a `const` with an identifier name.
 */
function bindingName(call: ts.CallExpression): string | undefined {
  let node: ts.Node = call.parent;
  while (
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isParenthesizedExpression(node)
  )
    node = node.parent;
  return ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) ? node.name.text : undefined;
}
