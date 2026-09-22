import { createSourceLocation } from "@relkit/contracts";
import { createDiagnostic } from "@relkit/diagnostics";
import * as ts from "typescript";
import { NORMALIZE_CODES } from "../normalize-codes.js";
import type { NormalizedDescriptor, NormalizationWork } from "../normalize-types.js";
import { isRecord } from "../normalize-utils.js";

const WAIT_NAMES = new Set(["sleep", "sleepUntil"]);
const EXTERNAL_METHODS = new Set([
  "charge",
  "delete",
  "insert",
  "publish",
  "send",
  "update",
  "write",
]);
const ORDER_METHODS = new Set(["keys", "entries", "values"]);

/** Emits bounded, warning-only replay advice from source text already supplied to the compiler. */
export function validateReplayAdvisories(work: NormalizationWork): void {
  for (const task of work.descriptors.filter((entry) => entry.kind === "task")) {
    const value = isRecord(task.value) ? task.value : {};
    if (value.execution === "retryable") continue;
    const source = sourceFor(work, task);
    if (source === undefined) continue;
    inspectWaits(work, task, source.file, source.text);
  }
}

function inspectWaits(
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
  file: string,
  source: string,
): void {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const calls: ts.CallExpression[] = [];
  const waits: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      calls.push(node);
      if (callName(node) !== undefined && WAIT_NAMES.has(callName(node)!)) waits.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  for (const wait of waits) {
    const offset = wait.getStart(sourceFile);
    const key = waitKey(wait);
    if (key === undefined || hasUnstableKey(key)) {
      warning(
        work,
        descriptor,
        file,
        source,
        offset,
        "Durable wait identity is not derived from a stable input or explicit constant.",
        "Use an accepted-input-derived or versioned constant key so replay resumes the same wait.",
      );
    }
    if (calls.some((call) => call.getStart(sourceFile) < offset && isExternalCall(call))) {
      warning(
        work,
        descriptor,
        file,
        source,
        offset,
        "External work appears before a durable wait and may repeat during replay.",
        "Move the effect behind an idempotency key or durable outbox and make the operation replay-safe.",
      );
    }
  }
}

function callName(call: ts.CallExpression): string | undefined {
  const expression = call.expression;
  if (ts.isIdentifier(expression)) return expression.text;
  return ts.isPropertyAccessExpression(expression) ? expression.name.text : undefined;
}

function waitKey(call: ts.CallExpression): ts.Expression | undefined {
  for (const argument of call.arguments) {
    if (!ts.isObjectLiteralExpression(argument)) continue;
    for (const property of argument.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const name = property.name;
      if (ts.isIdentifier(name) && name.text === "key") return property.initializer;
      if (ts.isStringLiteral(name) && name.text === "key") return property.initializer;
    }
  }
  return undefined;
}

function hasUnstableKey(value: ts.Node): boolean {
  let unstable = false;
  const visit = (node: ts.Node): void => {
    if (unstable) return;
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "Date"
    ) {
      unstable = true;
      return;
    }
    if (ts.isIdentifier(node) && ["randomUUID", "randomBytes"].includes(node.text)) {
      unstable = true;
      return;
    }
    if (ts.isPropertyAccessExpression(node)) {
      const object = node.expression;
      if (
        (ts.isIdentifier(object) &&
          ["Date", "Math", "crypto"].includes(object.text) &&
          ["now", "random", "randomUUID", "randomBytes"].includes(node.name.text)) ||
        ORDER_METHODS.has(node.name.text)
      ) {
        unstable = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(value);
  return unstable;
}

function isExternalCall(call: ts.CallExpression): boolean {
  const expression = call.expression;
  if (ts.isIdentifier(expression)) return expression.text === "fetch";
  if (!ts.isPropertyAccessExpression(expression)) return false;
  return (
    EXTERNAL_METHODS.has(expression.name.text) ||
    (ts.isIdentifier(expression.expression) && expression.expression.text === "axios")
  );
}

function warning(
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
  file: string,
  source: string,
  offset: number,
  message: string,
  suggestion: string,
): void {
  const position = source.slice(0, offset).split("\n");
  work.diagnostics.push(
    createDiagnostic({
      code: NORMALIZE_CODES.jobReplay,
      severity: "warning",
      message,
      descriptorId: descriptor.id,
      location: createSourceLocation(file, position.length, (position.at(-1)?.length ?? 0) + 1),
      suggestion,
    }),
  );
}

function sourceFor(
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
): { readonly file: string; readonly text: string } | undefined {
  const target = descriptor.source.file.replaceAll("\\", "/").replace(/^\.\//u, "");
  return work.input.sources
    ?.map((source) => ({
      file: source.fileName.replaceAll("\\", "/").replace(/^\.\//u, ""),
      text: source.text,
    }))
    .find((source) => source.file === target || source.file.endsWith(`/${target}`));
}
