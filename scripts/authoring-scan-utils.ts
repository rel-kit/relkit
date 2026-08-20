import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import * as ts from "typescript";

export type AuthoringViolation = {
  file: string;
  line: number;
  column: number;
  rule: string;
  message: string;
};

export type Fragment = { path: string; text: string; fullText: string; offset: number };

export function authoringFragments(root: string): Fragment[] {
  const result: Fragment[] = [];
  const packageRoot = resolve(root, "packages");
  for (const path of new Bun.Glob("**/README.md").scanSync({ cwd: packageRoot, onlyFiles: true })) {
    const file = resolve(packageRoot, path);
    result.push(...markdownFragments(file, readFileSync(file, "utf8")));
  }
  const fixtureRoot = resolve(root, "examples/commerce");
  for (const path of new Bun.Glob("**/*.ts").scanSync({ cwd: fixtureRoot, onlyFiles: true })) {
    const file = resolve(fixtureRoot, path);
    const text = readFileSync(file, "utf8");
    result.push({ path: file, text, fullText: text, offset: 0 });
  }
  return result.sort((left, right) => left.path.localeCompare(right.path));
}

function markdownFragments(path: string, fullText: string): Fragment[] {
  const result: Fragment[] = [];
  const blocks = /```(?:ts|tsx|typescript|js|jsx|javascript|mjs|cjs)?[ \t]*\r?\n([\s\S]*?)```/gi;
  for (const match of fullText.matchAll(blocks)) {
    const text = match[1];
    const offset = (match.index ?? 0) + match[0].indexOf(text ?? "");
    if (text !== undefined) result.push({ path, text, fullText, offset });
  }
  return result;
}

export function add(
  root: string,
  fragment: Fragment,
  findings: AuthoringViolation[],
  rule: string,
  message: string,
  offset: number,
): void {
  const before = fragment.fullText.slice(0, fragment.offset + offset);
  findings.push({
    file: relative(root, fragment.path).replaceAll("\\", "/"),
    line: before.split("\n").length,
    column: fragment.offset + offset - before.lastIndexOf("\n"),
    rule,
    message,
  });
}

export function fullName(expression: ts.Expression): string {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression))
    return `${fullName(expression.expression)}.${expression.name.text}`;
  return "";
}

export function propertyName(property: ts.PropertyName | undefined): string | undefined {
  if (!property) return undefined;
  return ts.isIdentifier(property) || ts.isStringLiteral(property) ? property.text : undefined;
}

export function hasFunction(node: ts.Node): boolean {
  let found = false;
  const visit = (current: ts.Node): void => {
    if (ts.isFunctionLike(current)) found = true;
    if (!found) ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

export function stringValue(node: ts.Expression): string | undefined {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
    ? node.text
    : undefined;
}
