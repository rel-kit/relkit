/**
 * Finds Effect types that application-facing declarations expose. It walks from each exported
 * symbol, or from each type a generated declaration names, through the declarations those types
 * reference, and reports a path that reaches a declaration from `effect` or `@effect/*`.
 */
import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import * as ts from "typescript";
import type { DeclarationLeak } from "./check-public-declarations";

const effectModule = /^(?:effect|@effect\/[^/]+)(?:\/.*)?$/;
const effectFile = /[\\/]node_modules[\\/](?:effect|@effect[\\/][^\\/]+)[\\/]/;
const libraryFile = /[\\/]node_modules[\\/]typescript[\\/]lib[\\/]/;
const relkitPackageFile = /[\\/]node_modules[\\/](?:relkit|@relkit[\\/][^\\/]+)[\\/]/;

/** What to check: the exports of `entries`, and every type that `references` files name. */
export interface EffectScanOptions {
  readonly root: string;
  readonly entries?: readonly string[];
  readonly references?: readonly string[];
  readonly compilerOptions?: ts.CompilerOptions;
}

/**
 * Reports each exported symbol or referenced type that reaches an Effect declaration.
 * Application source (any file that is not a declaration file) is not followed, because an
 * application may use Effect itself; third-party declarations other than Effect are not followed.
 * @param options - Declaration entries, generated reference files and compiler options.
 * @returns One leak per exported symbol or reference, with the path that reaches Effect.
 */
export function effectTypeLeaks(options: EffectScanOptions): DeclarationLeak[] {
  const entries = options.entries ?? [];
  const references = options.references ?? [];
  if (entries.length + references.length === 0) return [];
  const program = ts.createProgram([...entries, ...references], {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: true,
    noEmit: true,
    ...options.compilerOptions,
  });
  const walker = new EffectWalker(program.getTypeChecker());
  const leaks: DeclarationLeak[] = [];
  const report = (node: ts.Node, path: readonly string[]) => {
    const source = node.getSourceFile();
    const position = source.getLineAndCharacterOfPosition(node.getStart(source));
    leaks.push({
      file: relative(options.root, source.fileName),
      line: position.line + 1,
      column: position.character + 1,
      symbol: `effect-type: ${path.join(" > ")}`,
    });
  };
  for (const entry of entries) {
    const source = program.getSourceFile(entry);
    const module = source && walker.checker.getSymbolAtLocation(source);
    if (!source || !module) throw new Error(`Cannot inspect declaration entry ${entry}`);
    for (const symbol of walker.checker.getExportsOfModule(module)) {
      const path = walker.reach(symbol);
      if (path)
        report(
          symbol.declarations?.[0] ?? source,
          path[0]?.startsWith(`${symbol.name} (`) ? path : [symbol.name, ...path],
        );
    }
  }
  for (const file of references) {
    const source = program.getSourceFile(file);
    if (!source) throw new Error(`Cannot inspect generated declaration ${file}`);
    walker.eachReference(source, (node, path) => report(node, path));
  }
  return leaks;
}

class EffectWalker {
  readonly #reached = new Map<ts.Symbol, readonly string[] | null>();
  readonly #walking = new Set<ts.Symbol>();

  constructor(readonly checker: ts.TypeChecker) {}

  /** Returns the symbol names from `symbol` to an Effect declaration, or null. */
  reach(symbol: ts.Symbol): readonly string[] | null {
    // Follow re-exports one step at a time, so an unresolved `effect` import is still seen.
    let current = symbol;
    for (const seen = new Set<ts.Symbol>(); current.flags & ts.SymbolFlags.Alias;) {
      const direct = this.#effectAlias(current);
      if (direct) return [direct];
      seen.add(current);
      const next = this.checker.getImmediateAliasedSymbol(current);
      if (!next || seen.has(next)) break;
      current = next;
    }
    const target =
      current.flags & ts.SymbolFlags.Alias ? this.checker.getAliasedSymbol(current) : current;
    if (this.#reached.has(target)) return this.#reached.get(target) ?? null;
    if (this.#walking.has(target)) return null;
    this.#walking.add(target);
    const found = this.#reachDeclarations(target);
    this.#walking.delete(target);
    this.#reached.set(target, found);
    return found;
  }

  /** Calls `visit` for each type reference in `node` that reaches Effect. */
  eachReference(node: ts.Node, visit: (node: ts.Node, path: readonly string[]) => void): void {
    const walk = (child: ts.Node): void => {
      if (isPrivateMember(child)) return;
      const reference = referencedName(child);
      if (reference) {
        const path = this.#reachName(child, reference);
        if (path) {
          visit(child, path);
          return;
        }
      }
      ts.forEachChild(child, walk);
    };
    walk(node);
  }

  #reachDeclarations(symbol: ts.Symbol): readonly string[] | null {
    const declarations = symbol.declarations ?? [];
    const files = declarations.map((declaration) => declaration.getSourceFile().fileName);
    if (files.some((file) => libraryFile.test(file))) return null;
    if (files.some((file) => effectFile.test(file))) return [`${symbol.name} (effect)`];
    for (const declaration of declarations) {
      const file = declaration.getSourceFile().fileName;
      if (!file.endsWith(".d.ts")) continue;
      if (/[\\/]node_modules[\\/]/.test(file) && !relkitPackageFile.test(file)) continue;
      let found: readonly string[] | null = null;
      this.eachReference(declaration, (_node, path) => {
        found ??= path;
      });
      if (found) return found;
    }
    return null;
  }

  #reachName(node: ts.Node, name: ts.Node): readonly string[] | null {
    if (ts.isImportTypeNode(node)) {
      const argument = node.argument;
      const specifier =
        ts.isLiteralTypeNode(argument) && ts.isStringLiteral(argument.literal)
          ? argument.literal.text
          : "";
      if (effectModule.test(specifier)) return [`import("${specifier}")`];
    }
    const symbol = this.checker.getSymbolAtLocation(name);
    if (!symbol) return null;
    const path = this.reach(symbol);
    if (!path) return null;
    // An Effect declaration or alias already names itself, as in "Effect (effect)".
    return path[0]?.startsWith(`${symbol.name} (`) ? path : [symbol.name, ...path];
  }

  /** Recognizes an import or re-export alias of an `effect` module, resolved or not. */
  #effectAlias(symbol: ts.Symbol): string | null {
    if (!(symbol.flags & ts.SymbolFlags.Alias)) return null;
    for (const declaration of symbol.declarations ?? []) {
      let node: ts.Node | undefined = declaration;
      while (node && !ts.isImportDeclaration(node) && !ts.isExportDeclaration(node))
        node = node.parent;
      const specifier = node?.moduleSpecifier;
      if (specifier && ts.isStringLiteral(specifier) && effectModule.test(specifier.text))
        return `${symbol.name} (${specifier.text})`;
    }
    return null;
  }
}

function referencedName(node: ts.Node): ts.Node | undefined {
  if (ts.isTypeReferenceNode(node)) return rightmost(node.typeName);
  if (ts.isTypeQueryNode(node)) return rightmost(node.exprName);
  if (ts.isExpressionWithTypeArguments(node)) return rightmost(node.expression);
  if (ts.isImportTypeNode(node)) return node.qualifier ? rightmost(node.qualifier) : node;
  return undefined;
}

function rightmost(name: ts.Node): ts.Node {
  if (ts.isQualifiedName(name)) return name.right;
  if (ts.isPropertyAccessExpression(name)) return name.name;
  return name;
}

function isPrivateMember(node: ts.Node): boolean {
  if (ts.isPrivateIdentifier(node)) return true;
  if (!ts.isPropertyDeclaration(node) && !ts.isMethodDeclaration(node)) return false;
  return (
    ts.isPrivateIdentifier(node.name) ||
    (ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword) ??
      false)
  );
}

/** Generated application declarations that `relkit check` writes beside the generated client. */
export const generatedDeclarationFiles = [
  "context-registry.d.ts",
  "event-registry.d.ts",
  "client-registry.d.ts",
] as const;

/** The example whose generated declarations the scan checks: it uses every generated registry. */
export const generatedProject = "examples/commerce";

/** Runs `relkit check` on the example so its generated declarations are current.
 * @param root - Repository root with a built `@relkit/cli`.
 * @returns After the check succeeds.
 */
export async function generateProjectDeclarations(root: string): Promise<void> {
  const cli = resolve(root, "packages/cli/dist/bin.js");
  if (!existsSync(cli))
    throw new Error("Build @relkit/cli before scanning generated declarations.");
  const child = Bun.spawn(
    [process.execPath, cli, "check", "--project-root", generatedProject, "--json"],
    { cwd: root, stdout: "ignore", stderr: "pipe" },
  );
  const [stderr, exitCode] = await Promise.all([new Response(child.stderr).text(), child.exited]);
  if (exitCode !== 0) throw new Error(`relkit check failed for ${generatedProject}:\n${stderr}`);
}
