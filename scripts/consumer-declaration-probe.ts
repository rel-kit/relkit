/** Compiles actual external declarations without substituting modules or suppressing errors. */
import { dirname, relative, resolve } from "node:path";
import { realpathSync } from "node:fs";
import ts from "typescript";
import { Effect } from "effect";
import type { ConsumerInstallation } from "./consumer-installation.types.js";
import { consumerModulePaths } from "./consumer-module-paths.js";
import { consumerModuleImports } from "./consumer-module-imports.js";
import type { ConsumerModuleEdge } from "./consumer-module-paths.types.js";
import { inspectionNative } from "./consumer-installation-native.js";

/**
 * Resolves the loaded imports, references and selected type roots with TypeScript.
 * @param files - Actual files loaded by the strict program.
 * @param entry - Consumer entry owning explicitly selected ambient types.
 * @param options - The same compiler options used for diagnostics.
 * @param host - The same consumer-rooted host used by the strict program.
 * @returns File edges whose targets are present in the actual loaded program.
 */
function declarationEdges(
  files: readonly ts.SourceFile[],
  entry: string,
  options: ts.CompilerOptions,
  host: ts.ModuleResolutionHost,
): ConsumerModuleEdge[] {
  const edges: ConsumerModuleEdge[] = [];
  const loaded = new Set(files.map((file) => file.fileName));
  const cache = ts.createModuleResolutionCache(dirname(entry), (file) => file, options);
  for (const file of files) {
    const references = ts.preProcessFile(file.text, true);
    for (const imported of consumerModuleImports(file)) {
      const target = ts.resolveModuleName(imported, file.fileName, options, host, cache)
        .resolvedModule?.resolvedFileName;
      if (target !== undefined && loaded.has(target))
        edges.push({ from: file.fileName, to: target });
    }
    for (const reference of references.referencedFiles) {
      const target = resolve(dirname(file.fileName), reference.fileName);
      if (loaded.has(target)) edges.push({ from: file.fileName, to: target });
    }
    for (const name of [
      ...references.typeReferenceDirectives.map((reference) => reference.fileName),
      ...(file.fileName === entry ? (options.types ?? []) : []),
    ]) {
      const target = ts.resolveTypeReferenceDirective(name, file.fileName, options, host)
        .resolvedTypeReferenceDirective?.resolvedFileName;
      if (target !== undefined && loaded.has(target))
        edges.push({ from: file.fileName, to: target });
    }
  }
  return edges;
}

/**
 * Retains real strict diagnostics and loaded declaration paths without SDK stubs.
 * @param root - External consumer installation root.
 * @param entry - Consumer source relative to that root.
 * @param installation - Independently measured physical package identities.
 * @param consumerName - Application identity in recorded paths.
 * @param types - Explicit ambient type packages owned by the fixture.
 * @returns A lazy strict compile observation; errors keep it incomplete.
 */
export const probeConsumerDeclarations = Effect.fn("ConsumerProbe.declarations")(
  (
    root: string,
    entry: string,
    installation: ConsumerInstallation,
    consumerName: string,
    types: readonly string[] = [],
  ) =>
    inspectionNative("probe.declarations", async () => {
      root = realpathSync(root);
      const options: ts.CompilerOptions = {
        target: ts.ScriptTarget.ES2022,
        lib: ["lib.es2022.full.d.ts", "lib.esnext.disposable.d.ts"],
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        customConditions: ["bun"],
        strict: true,
        skipLibCheck: false,
        noEmit: true,
        types: [...types],
        resolveJsonModule: true,
        allowImportingTsExtensions: true,
        exactOptionalPropertyTypes: true,
      };
      const source = resolve(root, entry);
      const host = ts.createCompilerHost(options);
      host.getCurrentDirectory = () => root;
      const program = ts.createProgram([source], options, host);
      const diagnostics = ts.getPreEmitDiagnostics(program).map((item) => ({
        code: item.code,
        message: ts.flattenDiagnosticMessageText(item.messageText, "\n"),
        ...(item.file === undefined ? {} : { file: relative(root, item.file.fileName) }),
      }));
      const files = program
        .getSourceFiles()
        .filter((file) => !program.isSourceFileDefaultLibrary(file));
      const graph = consumerModulePaths(
        source,
        files.map((file) => file.fileName),
        declarationEdges(files, source, options, host),
        root,
        installation,
        "declarations",
        consumerName,
      );
      return {
        diagnostics,
        unreached: graph.unreached,
        files: files.map((file) => relative(root, file.fileName)),
        observation: {
          boundary: "declarations" as const,
          complete: diagnostics.length === 0 && graph.unreached.length === 0,
          evidence: entry,
          paths: graph.paths,
        },
      };
    }),
);
