import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import * as ts from "typescript";

export interface LoggerSinkViolation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

const sinkFile = "packages/runtime-effect/src/logger.ts";

export function scanLoggerSinks(root: string): LoggerSinkViolation[] {
  const sourceRoot = resolve(root, "packages/runtime-effect/src");
  const violations: LoggerSinkViolation[] = [];
  for (const path of new Bun.Glob("**/*.ts").scanSync({ cwd: sourceRoot, onlyFiles: true })) {
    const file = resolve(sourceRoot, path);
    const text = readFileSync(file, "utf8");
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && isDirectOutput(node.expression)) {
        const relativeFile = relative(root, file).replaceAll("\\", "/");
        const location = source.getLineAndCharacterOfPosition(node.getStart(source));
        if (relativeFile !== sinkFile || !insideSinkAdapter(node)) {
          violations.push({
            file: relativeFile,
            line: location.line + 1,
            column: location.character + 1,
            message: "Direct console/process output is allowed only in final logger sink adapters.",
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return violations.sort((left, right) =>
    `${left.file}:${left.line}:${left.column}`.localeCompare(
      `${right.file}:${right.line}:${right.column}`,
    ),
  );
}

function isDirectOutput(expression: ts.Expression): boolean {
  if (!ts.isPropertyAccessExpression(expression)) return false;
  if (ts.isIdentifier(expression.expression) && expression.expression.text === "console")
    return true;
  return (
    expression.name.text === "write" &&
    ts.isPropertyAccessExpression(expression.expression) &&
    ts.isIdentifier(expression.expression.expression) &&
    expression.expression.expression.text === "process" &&
    (expression.expression.name.text === "stdout" || expression.expression.name.text === "stderr")
  );
}

function insideSinkAdapter(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current !== undefined && !ts.isSourceFile(current)) {
    const name = declarationName(current);
    if (name !== undefined) return /sink/i.test(name);
    current = current.parent;
  }
  return false;
}

function declarationName(node: ts.Node): string | undefined {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text;
  if (ts.isFunctionDeclaration(node) && node.name !== undefined) return node.name.text;
  if (ts.isMethodDeclaration(node) && node.name !== undefined && ts.isIdentifier(node.name))
    return node.name.text;
  return undefined;
}

function main(): void {
  const root = resolve(process.argv[2] ?? resolve(import.meta.dir, ".."));
  const violations = scanLoggerSinks(root);
  for (const violation of violations)
    console.error(`${violation.file}:${violation.line}:${violation.column} ${violation.message}`);
  if (violations.length > 0) {
    console.error(`Logger sink source scan failed with ${violations.length} violation(s).`);
    process.exitCode = 1;
    return;
  }
  console.log("Logger sink source scan passed.");
}

if (import.meta.main) main();
