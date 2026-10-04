import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import * as ts from "typescript";
import type { ExampleImportReplacement } from "./check-docgen-examples.types.js";

/** Resolves extracted snippet imports against their documented source module.
 * @param code - Standalone extracted example. @param owner - Original authored module.
 * @returns Equivalent module-scoped code with owner-relative imports resolved.
 */
export function restoreExampleContext(code: string, owner: string): string {
  const source = ts.createSourceFile(owner, code, ts.ScriptTarget.Latest, true);
  const replacements: ExampleImportReplacement[] = [];
  /** Collects native module-specifier corrections without changing example behavior.
   * @param node - Parsed snippet node. @returns After visiting its descendants. */
  const visit = (node: ts.Node): void => {
    const specifier =
      ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
        ? node.moduleSpecifier
        : ts.isCallExpression(node) &&
            (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
              (ts.isIdentifier(node.expression) && node.expression.text === "require"))
          ? node.arguments[0]
          : undefined;
    if (specifier !== undefined && ts.isStringLiteral(specifier) && specifier.text.startsWith("."))
      replacements.push({
        start: specifier.getStart(source),
        end: specifier.end,
        value: JSON.stringify(resolve(dirname(owner), specifier.text)),
      });
    ts.forEachChild(node, visit);
  };
  visit(source);
  let restored = code;
  for (const replacement of replacements.sort((left, right) => right.start - left.start))
    restored =
      restored.slice(0, replacement.start) + replacement.value + restored.slice(replacement.end);
  // Examples are separate modules, not declarations in one shared global script.
  return `${restored}\nexport {};\n`;
}

/** Typechecks every unchanged extracted example in its original import context.
 * @param args - Original docgen TypeScript arguments. @param sourceRoot - Authored package source.
 * @param executable - Existing pinned TypeScript binary. @returns The original compiler exit code.
 */
export async function checkDocgenExamples(
  args: string[],
  sourceRoot: string,
  executable: string,
): Promise<number> {
  const projectIndex = args.indexOf("--project");
  const project = args[projectIndex + 1];
  if (projectIndex === -1 || project === undefined)
    throw new Error("Missing docgen example project.");
  const owners = [
    ...new Bun.Glob("**/*.{ts,tsx,mts,cts}").scanSync({ cwd: sourceRoot, absolute: true }),
  ].sort((left, right) => right.length - left.length);
  const directory = dirname(resolve(project));
  for (const name of await readdir(directory)) {
    if (!name.endsWith(".ts") || name === "index.ts") continue;
    const prefix = name.replace(/^\d+-/, "");
    const owner = owners.find((file) => prefix.startsWith(`${file.replaceAll("/", "-")}-`));
    if (owner === undefined)
      throw new Error(`Missing documented source owner for ${basename(name)}.`);
    const file = resolve(directory, name);
    await writeFile(file, restoreExampleContext(await readFile(file, "utf8"), owner));
  }
  return await Bun.spawn([executable, ...args], { stdout: "inherit", stderr: "inherit" }).exited;
}

if (import.meta.main) {
  const sourceRoot = process.env.RELKIT_DOCGEN_SOURCE_ROOT;
  const executable = process.env.RELKIT_DOCGEN_TSC;
  if (sourceRoot === undefined || executable === undefined)
    throw new Error("Missing docgen checker context.");
  process.exitCode = await checkDocgenExamples(process.argv.slice(2), sourceRoot, executable);
}
