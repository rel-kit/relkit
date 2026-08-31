import * as ts from "typescript";
import type { DeclarationLeak } from "./check-public-declarations";

export function nonFunctionHandlers(file: string, text: string): DeclarationLeak[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const leaks: DeclarationLeak[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertySignature(node) &&
      node.name.getText(source) === "handler" &&
      node.type?.kind !== ts.SyntaxKind.NeverKeyword
    ) {
      const declaration = nearestDeclaration(node);
      if (!declaration || ts.getModifiers(declaration)?.some(isExportModifier) !== true) {
        ts.forEachChild(node, visit);
        return;
      }
      const owner = ts.isInterfaceDeclaration(node.parent) ? node.parent.name.text : "type";
      if (!/Function|Middleware|RawRoute/.test(owner)) {
        const location = lineAndColumn(text, node.getStart(source));
        leaks.push({
          file,
          ...location,
          symbol: "non-function-handler",
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return leaks;
}

function nearestDeclaration(node: ts.Node): ts.Declaration | undefined {
  for (let current = node.parent; current && !ts.isSourceFile(current); current = current.parent) {
    if (ts.isDeclaration(current)) return current;
  }
  return undefined;
}

function isExportModifier(modifier: ts.Modifier): boolean {
  return modifier.kind === ts.SyntaxKind.ExportKeyword;
}

function lineAndColumn(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset);
  const lineStart = before.lastIndexOf("\n") + 1;
  return {
    line: before.split("\n").length,
    column: offset - lineStart + 1,
  };
}
