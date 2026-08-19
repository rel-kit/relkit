import { existsSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import * as ts from "typescript";
import { normalizeSourcePath } from "@zsys/contracts";

export interface ExportFact {
  readonly position: number;
  readonly origin?: { readonly module: string; readonly name: string };
}

export interface ExportFacts {
  readonly exports: ReadonlyMap<string, ExportFact>;
  readonly stars: readonly { readonly module: string; readonly position: number }[];
}

export interface ParsedSource {
  readonly sourceFile: ts.SourceFile;
  readonly facts: ExportFacts;
}

export function readFacts(sourceFile: ts.SourceFile): ExportFacts {
  const locals = new Map<string, number>();
  const exports = new Map<string, ExportFact>();
  const stars: { module: string; position: number }[] = [];
  const addLocal = (name: string, position: number): void => {
    locals.set(name, position);
  };
  const addExport = (name: string, fact: ExportFact): void => {
    exports.set(name, fact);
  };

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        const position =
          declaration.initializer?.getStart(sourceFile) ?? declaration.name.getStart(sourceFile);
        addLocal(declaration.name.text, position);
        if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
          addExport(declaration.name.text, { position });
        }
      }
    }
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (statement.name !== undefined)
        addLocal(statement.name.text, statement.getStart(sourceFile));
      if (hasModifier(statement, ts.SyntaxKind.ExportKeyword) && statement.name !== undefined) {
        addExport(statement.name.text, { position: statement.getStart(sourceFile) });
      }
      if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
        addExport("default", { position: statement.getStart(sourceFile) });
      }
    }
  }

  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      const expression = statement.expression;
      const position = ts.isIdentifier(expression)
        ? (locals.get(expression.text) ?? expression.getStart(sourceFile))
        : expression.getStart(sourceFile);
      addExport("default", { position });
    }
    if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) continue;
    const module =
      statement.moduleSpecifier && ts.isStringLiteralLike(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : undefined;
    if (statement.exportClause === undefined) {
      if (module !== undefined) stars.push({ module, position: statement.getStart(sourceFile) });
      continue;
    }
    if (!ts.isNamedExports(statement.exportClause)) continue;
    for (const element of statement.exportClause.elements) {
      if (element.isTypeOnly) continue;
      const name = element.name.text;
      const local = element.propertyName?.text ?? name;
      if (module === undefined) {
        addExport(name, { position: locals.get(local) ?? element.getStart(sourceFile) });
      } else {
        addExport(name, {
          position: element.getStart(sourceFile),
          origin: { module, name: local },
        });
      }
    }
  }
  return { exports, stars: Object.freeze(stars) };
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
