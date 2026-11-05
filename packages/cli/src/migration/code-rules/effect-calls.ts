/**
 * Part of rule `removed-aliases`: tool descriptors and graph nodes lost `invokeEffect`.
 * `tool.invokeEffect(input)` on a binding imported from a `*.tool` module becomes
 * `callToolEffect(tool, input)` from `relkit/effect`; any other `invokeEffect` receiver is
 * reported, naming `callGraphNodeEffect` for graph nodes.
 */
import { codeSyntax as ts, type CodeSource } from "../code-parser.js";
import { findingAt, walk, type TextEdit } from "../code-edits.js";
import { addNamedImport } from "../code-imports.js";
import type { CodeFinding } from "../code-migration.types.js";
import { importModule } from "./descriptor-bindings.js";

/**
 * Rewrites or reports `invokeEffect` calls.
 * @param source - Parsed file.
 * @param rule - Rule ID for findings.
 * @param findings - Finding collector.
 * @returns Edits for the calls and the `relkit/effect` import.
 */
export function invokeEffectCalls(
  source: CodeSource,
  rule: string,
  findings: CodeFinding[],
): TextEdit[] {
  const edits: TextEdit[] = [];
  walk(source, (node) => {
    if (
      !ts.isCallExpression(node) ||
      !ts.isPropertyAccessExpression(node.expression) ||
      node.expression.name.text !== "invokeEffect"
    )
      return;
    const receiver = node.expression.expression;
    const module = ts.isIdentifier(receiver) ? importModule(source, receiver.text) : undefined;
    if (module === undefined || !/\.tool(?:\.[cm]?[jt]sx?)?$/.test(module)) {
      findings.push(
        findingAt(
          source,
          node,
          rule,
          "invokeEffect was removed; call callToolEffect(tool, input) or callGraphNodeEffect(node, input) from relkit/effect.",
        ),
      );
      return;
    }
    const args = node.arguments.map((argument) => argument.getText(source));
    edits.push({
      start: node.getStart(source),
      end: node.getEnd(),
      text: `callToolEffect(${[receiver.getText(source), ...args].join(", ")})`,
    });
  });
  if (edits.length > 0) {
    const add = addNamedImport(source, "relkit/effect", "callToolEffect");
    if (add) edits.push(add);
  }
  return edits;
}
