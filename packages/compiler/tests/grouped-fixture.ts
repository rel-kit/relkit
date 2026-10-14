/**
 * Builds an isolated grouped copy of a checked-in flat compiler fixture. Whole
 * service trees move together and TypeScript module literals are rewritten by
 * resolved relative targets; the owner releases only this temporary fixture.
 */
import { Effect } from "effect";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import * as ts from "typescript";
import { discoverApplicationLayout } from "../src/discovery/application-layout.js";
import { compileProject } from "../../../tests/compiler/fixture-runner.js";
import type { AstSourceModule } from "../src/discovery/ast-prefilter.types.js";

/**
 * Compiles a controlled fixture after complete service moves and literal rewrites.
 * @param name - Test identity supplied to the compiler generation.
 * @param original - Checked-in flat fixture root, never modified.
 * @param sources - Baseline compilation's complete unevaluated source collection.
 * @returns A lazy grouped compilation with temporary-source cleanup on every outcome.
 */
export const compileGroupedFixtureEffect = Effect.fn("LayoutFixture.compileGrouped")(
  (name: string, original: string, sources: readonly AstSourceModule[]) =>
    Effect.acquireUseRelease(
      Effect.tryPromise(() => mkdtemp(resolve(tmpdir(), "relkit-grouped-fixture-"))),
      (root) =>
        Effect.gen(function* () {
          const layout = discoverApplicationLayout(sources, original);
          const roots = layout.services.map((service) => service.root);
          yield* Effect.tryPromise(() =>
            cp(resolve(original, "src"), resolve(root, "src"), { recursive: true }),
          );
          yield* Effect.tryPromise(() => mkdir(resolve(root, "src/services"), { recursive: true }));
          for (const service of roots)
            yield* Effect.tryPromise(() =>
              cp(
                resolve(root, service),
                resolve(root, service.replace(/^src\//, "src/services/")),
                { recursive: true },
              ),
            );
          for (const source of sources) {
            const destination = movedPath(source.fileName, roots);
            const text = rewriteFixtureImports(source.text, source.fileName, destination, roots);
            yield* Effect.tryPromise(() =>
              mkdir(dirname(resolve(root, destination)), { recursive: true }),
            );
            yield* Effect.tryPromise(() => writeFile(resolve(root, destination), text));
          }
          for (const service of roots)
            yield* Effect.tryPromise(() => rm(resolve(root, service), { recursive: true }));
          const config = yield* Effect.tryPromise(() =>
            readFile(resolve(original, "relkit.config.ts"), "utf8"),
          );
          yield* Effect.tryPromise(() => writeFile(resolve(root, "relkit.config.ts"), config));
          return yield* Effect.tryPromise(() => compileProject(name, root));
        }),
      (root) => Effect.tryPromise(() => rm(root, { recursive: true, force: true })),
    ),
);

/**
 * Projects only known service-root paths into the controlled grouped fixture.
 * @param file - Portable fixture source path.
 * @param roots - Evidenced flat service roots.
 * @returns Grouped physical destination or the unchanged Routes/Platform/config path.
 */
function movedPath(file: string, roots: readonly string[]): string {
  if (!roots.some((root) => file.startsWith(`${root}/`))) return file;
  return file.replace(/^src\//, "src/services/");
}

/**
 * Rewrites source dependency literals while preserving comments/unrelated strings.
 * @param text - Complete original authored module.
 * @param before - Flat physical importer.
 * @param after - Grouped physical importer.
 * @param roots - Controlled fixture's evidenced service roots.
 * @returns Source text whose relative dependencies still target the same modules.
 */
function rewriteFixtureImports(
  text: string,
  before: string,
  after: string,
  roots: readonly string[],
): string {
  const source = ts.createSourceFile(before, text, ts.ScriptTarget.Latest, true);
  const edits: { start: number; end: number; text: string }[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      const specifier = node.moduleSpecifier;
      if (specifier.text.startsWith(".")) {
        const target = relative("/fixture", resolve("/fixture", dirname(before), specifier.text));
        const moved = movedPath(target, roots);
        let next = relative(dirname(after), moved).replaceAll("\\", "/");
        if (!next.startsWith(".")) next = `./${next}`;
        edits.push({
          start: specifier.getStart(source) + 1,
          end: specifier.getEnd() - 1,
          text: next,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const edit of edits.reverse())
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  return text;
}
