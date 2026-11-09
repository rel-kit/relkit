/**
 * Rule `problem-details`: HTTP error responses became RFC 9457 Problem Details, with the
 * error's code in `code` instead of the old `error` field. Code that reads a response body
 * cannot be told from other objects by syntax, so this rule changes nothing and reports the
 * two shapes that usually read the old field: `x.error === "code"` comparisons and test
 * expectations such as `toEqual({ error: "not-found" })`.
 */
import { codeSyntax as ts, parseCodeSource } from "../code-parser.js";
import { findingAt, literalText, objectProperty, walk } from "../code-edits.js";
import type { CodeFinding, CodeRule } from "../code-migration.types.js";

const id = "problem-details";
const matchers = new Set(["toEqual", "toStrictEqual", "toMatchObject"]);
const message =
  "Error responses are Problem Details now: read body.code (and status, detail, data) instead of body.error.";

export const problemDetailsRule: CodeRule = {
  id,
  summary: "Read the code field of Problem Details error responses",
  guide: "problem-details",
  appliesTo: (path) => /\.[cm]?[jt]sx?$/.test(path) && !/\.d\.[cm]?ts$/.test(path),
  apply: (file) => {
    const source = parseCodeSource(file.path, file.text);
    const findings: CodeFinding[] = [];
    walk(source, (node) => {
      if (
        ts.isBinaryExpression(node) &&
        [
          ts.SyntaxKind.EqualsEqualsEqualsToken,
          ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ].includes(node.operatorToken.kind) &&
        [node.left, node.right].some(
          (side) => ts.isPropertyAccessExpression(side) && side.name.text === "error",
        ) &&
        [node.left, node.right].some((side) => literalText(side) !== undefined)
      )
        findings.push(findingAt(source, node, id, message));
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        matchers.has(node.expression.name.text)
      ) {
        const expected = node.arguments[0];
        const error =
          expected && ts.isObjectLiteralExpression(expected)
            ? objectProperty(expected, "error")
            : undefined;
        if (error && ts.isPropertyAssignment(error) && literalText(error.initializer) !== undefined)
          findings.push(findingAt(source, node, id, message));
      }
    });
    return { text: file.text, findings };
  },
};
