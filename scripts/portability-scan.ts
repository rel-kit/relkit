/**
 * Finds runtime-specific code in TypeScript sources: `Bun.*` globals, imports of `bun` and
 * `bun:*` modules, and imports of `node:*` modules. Runtime adapters, the files under a `bun/` or
 * `node/` directory or named `*.bun.ts` or `*.node.ts`, may use them; everything else goes through
 * an adapter.
 */
import ts from "typescript";

/** Kind of runtime-specific use. */
export type PortabilityKind = "bun" | "node";

/** One runtime-specific call site. */
export interface PortabilityUse {
  readonly file: string;
  readonly line: number;
  readonly kind: PortabilityKind;
  readonly text: string;
}

/**
 * Tells whether a repository-relative path is a runtime adapter.
 * @param file - Path with forward slashes.
 * @returns Whether runtime-specific code is allowed in it.
 */
export function isRuntimeAdapter(file: string): boolean {
  const segments = file.split("/");
  const name = segments.at(-1) ?? "";
  return (
    segments.slice(0, -1).some((segment) => segment === "bun" || segment === "node") ||
    /\.(bun|node)\.ts$/u.test(name)
  );
}

/**
 * Lists the runtime-specific uses in one source file, comments and strings excluded.
 * @param file - Repository-relative path, used in the results.
 * @param source - File contents.
 * @returns Uses in source order.
 */
export function portabilityUses(file: string, source: string): PortabilityUse[] {
  // Most files mention neither runtime; skip parsing them.
  if (!/\bBun\b|["'`]bun["':]|["'`]node:/u.test(source)) return [];
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const uses: PortabilityUse[] = [];
  const add = (node: ts.Node, kind: PortabilityKind) => {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    uses.push({ file, line, kind, text: node.getText(sourceFile).split("\n")[0]!.slice(0, 120) });
  };
  const visit = (node: ts.Node): void => {
    const specifier = moduleSpecifier(node);
    if (specifier !== undefined) {
      if (specifier === "bun" || specifier.startsWith("bun:")) add(node, "bun");
      else if (specifier.startsWith("node:")) add(node, "node");
    } else if (isBunReference(node)) {
      add(node, "bun");
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return uses;
}

/**
 * Reads the module a declaration or call loads.
 * @param node - Any syntax node.
 * @returns The module specifier for imports, re-exports, `import()` and `require()`.
 */
function moduleSpecifier(node: ts.Node): string | undefined {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier !== undefined &&
    ts.isStringLiteral(node.moduleSpecifier)
  )
    return node.moduleSpecifier.text;
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
    const literal = node.argument.literal;
    return ts.isStringLiteral(literal) ? literal.text : undefined;
  }
  if (
    ts.isCallExpression(node) &&
    (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
    node.arguments[0] !== undefined &&
    ts.isStringLiteralLike(node.arguments[0])
  )
    return node.arguments[0].text;
  return undefined;
}

/**
 * Recognizes `Bun.x` values, `Bun.X` types and `typeof Bun`.
 * @param node - Any syntax node.
 * @returns Whether the node names the `Bun` global.
 */
function isBunReference(node: ts.Node): boolean {
  if (ts.isPropertyAccessExpression(node))
    return ts.isIdentifier(node.expression) && node.expression.text === "Bun";
  if (ts.isQualifiedName(node)) return ts.isIdentifier(node.left) && node.left.text === "Bun";
  if (ts.isTypeOfExpression(node) || ts.isTypeQueryNode(node)) {
    const target = ts.isTypeOfExpression(node) ? node.expression : node.exprName;
    return ts.isIdentifier(target) && target.text === "Bun";
  }
  return false;
}
