import { existsSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { normalizeSourcePath } from "@zsys/contracts";
import * as ts from "typescript";
import type { ExportFacts } from "./source-facts.js";

export { readFacts } from "./source-facts.js";
export type {
  ErrorBindingFact,
  ExportFact,
  ExportFacts,
  FactoryBindingFact,
  FactoryIdPresence,
  RouteOperationFact,
  ServiceMemberFact,
  SourceFacts,
  SourceFactoryKind,
} from "./source-facts.js";

export interface ParsedSource {
  readonly sourceFile: ts.SourceFile;
  readonly facts: ExportFacts;
}

export function resolveImport(
  file: string,
  module: string,
  root: string,
  texts: ReadonlyMap<string, string>,
): string | undefined {
  if (!module.startsWith(".")) return undefined;
  const base = resolve(root, dirname(file), module);
  const candidates = extname(base)
    ? [base]
    : [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, join(base, "index.ts")];
  for (const candidate of candidates) {
    try {
      const relative = normalizeSourcePath(candidate, root);
      if (texts.has(relative) || existsSync(candidate)) return relative;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return (
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) === true
  );
}
