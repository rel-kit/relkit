import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import * as ts from "typescript";
import { scanLoggerSinks } from "./check-logger-sinks.ts";

export const OBSERVABILITY_SOURCE_ROOTS = Object.freeze([
  "packages/observability/src",
  "packages/runtime-effect/src",
  "packages/runtime-hono/src",
  "packages/engine/src",
  "packages/agents/src",
  "packages/inspector-api/src",
  "packages/cli/src/commands",
] as const);

export const OBSERVABILITY_DIRECT_OUTPUT_ADAPTERS = Object.freeze([
  "packages/cli/src/commands/dev-logger.ts",
] as const);

export const OBSERVABILITY_RECORD_ADAPTERS = Object.freeze([
  "packages/observability/src/redaction.ts",
  "packages/observability/src/record-admission.ts",
  "packages/observability/src/storage/segments.ts",
  "packages/observability/src/storage/index.ts",
  "packages/observability/src/storage/index-files.ts",
  "packages/observability/src/storage/segment-files.ts",
  "packages/runtime-effect/src/logger.ts",
  "packages/inspector-api/src/observability.ts",
  "packages/inspector-api/src/observability-utils.ts",
] as const);

export interface ObservabilitySinkViolation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly rule: "direct-output" | "record-serialization";
  readonly message: string;
}

export function scanObservabilitySinks(root: string): ObservabilitySinkViolation[] {
  const violations = scanLoggerSinks(root).map((violation) => ({
    ...violation,
    rule: "direct-output" as const,
  }));
  for (const sourceRoot of OBSERVABILITY_SOURCE_ROOTS) {
    const directory = resolve(root, sourceRoot);
    for (const path of new Bun.Glob("**/*.ts").scanSync({ cwd: directory, onlyFiles: true })) {
      const file = resolve(directory, path);
      const relativeFile = relative(root, file).replaceAll("\\", "/");
      if (relativeFile === "packages/runtime-effect/src/logger.ts") continue;
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      visit(source, source, relativeFile, violations);
    }
  }
  return violations.sort((left, right) =>
    `${left.file}:${left.line}:${left.column}:${left.rule}`.localeCompare(
      `${right.file}:${right.line}:${right.column}:${right.rule}`,
    ),
  );
}

function visit(
  node: ts.Node,
  source: ts.SourceFile,
  file: string,
  violations: ObservabilitySinkViolation[],
): void {
  if (ts.isCallExpression(node)) {
    if (
      isDirectOutput(node.expression) &&
      !OBSERVABILITY_DIRECT_OUTPUT_ADAPTERS.includes(file as never)
    )
      add(
        violations,
        source,
        node,
        file,
        "direct-output",
        "Direct output is outside logger sinks.",
      );
    if (isRecordSerialization(node) && !OBSERVABILITY_RECORD_ADAPTERS.includes(file as never))
      add(
        violations,
        source,
        node,
        file,
        "record-serialization",
        "Observability records may be serialized only by owned adapters.",
      );
  }
  ts.forEachChild(node, (child) => visit(child, source, file, violations));
}

function add(
  violations: ObservabilitySinkViolation[],
  source: ts.SourceFile,
  node: ts.Node,
  file: string,
  rule: ObservabilitySinkViolation["rule"],
  message: string,
): void {
  const location = source.getLineAndCharacterOfPosition(node.getStart(source));
  violations.push({ file, line: location.line + 1, column: location.character + 1, rule, message });
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

function isRecordSerialization(node: ts.CallExpression): boolean {
  if (node.arguments.length === 0) return false;
  const expression = node.expression.getText(node.getSourceFile());
  if (expression !== "canonicalJson" && expression !== "JSON.stringify") return false;
  const argument = node.arguments[0]!.getText(node.getSourceFile()).replaceAll(/\s/g, "");
  return /(?:^|\.)(?:record|records|event|events|telemetry|observability|log|logs|trace|traces|span|spans|request|requests)$/.test(
    argument,
  );
}

function main(): void {
  const root = resolve(process.argv[2] ?? resolve(import.meta.dir, ".."));
  const violations = scanObservabilitySinks(root);
  for (const violation of violations)
    console.error(
      `${violation.file}:${violation.line}:${violation.column} [${violation.rule}] ${violation.message}`,
    );
  if (violations.length > 0) {
    console.error(`Observability sink source scan failed with ${violations.length} violation(s).`);
    process.exitCode = 1;
    return;
  }
  console.log("Observability sink source scan passed.");
}

if (import.meta.main) main();
