/** Moves an owned grouped specialized fixture to flat compatibility layout using only resolved TypeScript module literals. */
import { lstat, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import * as ts from "typescript";
import { Effect } from "effect";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";

/**
 * Produces the equivalent flat fixture without changing descriptors, provider configuration or protected state.
 * @param root - Test-owned grouped application root.
 * @returns Completion after literal rewrites and whole-service moves settle.
 */
export const flattenGeneratedHost = Effect.fn("GeneratedHost.flatten")((root: string) =>
  scaffoldNative("generated.host.flatten", async () => {
    const files = [
      ...new Bun.Glob("{src,tests}/**/*.ts").scanSync({ cwd: root, onlyFiles: true }),
      "relkit.config.ts",
    ];
    for (const before of files.filter((path) => !path.endsWith(".d.ts"))) {
      const after = flatPath(before);
      const source = await readFile(join(root, before), "utf8");
      await writeFile(join(root, before), flattenImports(source, before, after));
    }
    for (const entry of await readdir(join(root, "src/services"), { withFileTypes: true })) {
      if (!entry.isDirectory())
        throw new Error("Controlled fixture has an unexpected grouping entry");
      await removeCopiedGeneratedResidue(join(root, "src", entry.name));
      await rename(join(root, "src/services", entry.name), join(root, "src", entry.name));
    }
  }),
);

/**
 * Removes only copied compiler residue at a controlled flat destination; authored content remains a fixture conflict.
 * @param destination - Destination owned entirely by the temporary fixture scope.
 * @returns Completion when the destination is absent or contains only known emitted JavaScript/declaration files.
 */
async function removeCopiedGeneratedResidue(destination: string): Promise<void> {
  try {
    await lstat(destination);
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return;
    throw cause;
  }
  const files = [
    ...new Bun.Glob("**/*").scanSync({ cwd: destination, onlyFiles: true, dot: true }),
  ];
  if (files.some((file) => !/(?:\.d\.ts(?:\.map)?|\.js(?:\.map)?)$/.test(file)))
    throw new Error("Controlled flat destination contains authored content");
  await rm(destination, { recursive: true });
}

/**
 * Projects only the controlled fixture's evidenced grouping container.
 * @param path - Project-relative authored source path.
 * @returns Equivalent flat physical path, preserving Routes and Platform.
 */
function flatPath(path: string): string {
  return path.replace(/^src\/services\//, "src/");
}

/**
 * Rewrites module literals by their actual controlled source target, preserving other text and relative service internals.
 * @param text - Complete native fixture source.
 * @param before - Grouped importer path.
 * @param after - Equivalent flat importer path.
 * @returns The same source with its resolved module paths retained after movement.
 */
function flattenImports(text: string, before: string, after: string): string {
  const source = ts.createSourceFile(before, text, ts.ScriptTarget.Latest, true);
  const edits: ts.TextChange[] = [];
  const visit = (node: ts.Node): void => {
    const module =
      ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
        ? node.moduleSpecifier
        : undefined;
    if (module && ts.isStringLiteral(module) && module.text.startsWith("@app/services/")) {
      edits.push({
        span: { start: module.getStart(source), length: module.getWidth(source) },
        newText: JSON.stringify(module.text.replace(/^@app\/services\//, "@app/")),
      });
    } else if (module && ts.isStringLiteral(module) && module.text.startsWith(".")) {
      const target = relative("/fixture", resolve("/fixture", dirname(before), module.text));
      let path = relative(dirname(after), flatPath(target)).replaceAll("\\", "/");
      if (!path.startsWith(".")) path = "./" + path;
      edits.push({
        span: { start: module.getStart(source), length: module.getWidth(source) },
        newText: JSON.stringify(path),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const edit of edits.reverse())
    text =
      text.slice(0, edit.span.start) +
      edit.newText +
      text.slice(edit.span.start + edit.span.length);
  return text;
}
