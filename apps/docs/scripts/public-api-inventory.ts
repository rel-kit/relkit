/** Resolves actual TypeScript exports, including aliases, star barrels and React entrypoints. */
import { relative, resolve } from "node:path";
import ts from "typescript";
import { apiPackageDefinitions } from "./documentation-catalog.js";
import { publicManifests } from "./public-api-manifests.js";
import { repositoryExamples } from "./public-api-examples.js";
import type { PublicImport, PublicSymbol, ReferenceSource } from "./public-api.types.js";

/** Reads public names from the compiler, never inferring coverage from the editorial catalog.
 * @param root - Repository root. @returns Every manifest path with its resolved public symbols. */
export function publicApiInventory(root: string): PublicImport[] {
  const entries = publicManifests(root);
  const program = ts.createProgram(
    entries.map(({ source }) => resolve(root, source)),
    {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      skipLibCheck: true,
      allowSyntheticDefaultImports: true,
      paths: Object.fromEntries(
        entries.map(({ specifier, source }) => [specifier, [resolve(root, source)]]),
      ),
    },
  );
  const checker = program.getTypeChecker();
  const examples = repositoryExamples(root, program);
  return entries.map((entry) => {
    if (entry.internal) return entry;
    if (!apiPackageDefinitions.some(({ packageName }) => packageName === entry.packageName))
      throw new Error(`Public package has no reference: ${entry.packageName}`);
    const source = program.getSourceFile(resolve(root, entry.source));
    const module = source && checker.getSymbolAtLocation(source);
    if (!module) throw new Error(`Cannot inspect public module ${entry.specifier}`);
    const symbols = checker.getExportsOfModule(module).map((symbol) => {
      const described = describeSymbol(root, checker, symbol);
      const exampleSource = examples.get(`${described.source}:${described.original}`);
      return exampleSource ? { ...described, exampleSource } : described;
    });
    return { ...entry, symbols: symbols.sort((a, b) => a.name.localeCompare(b.name)) };
  });
}

/** Keeps declaration identity so legacy/current names and re-exported aliases stay distinct.
 * @param root - Repository root. @param checker - Owning program checker.
 * @param symbol - Exported name. @returns Source-backed documentation facts. */
function describeSymbol(root: string, checker: ts.TypeChecker, symbol: ts.Symbol): PublicSymbol {
  const original = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const declaration = original.getDeclarations()?.[0];
  if (!declaration) throw new Error(`Unresolved public export: ${symbol.name}`);
  const file = declaration.getSourceFile();
  return {
    name: symbol.name,
    original:
      original.name === "default" &&
      (ts.isFunctionDeclaration(declaration) || ts.isClassDeclaration(declaration)) &&
      declaration.name
        ? declaration.name.text
        : original.name,
    source: relative(root, file.fileName),
    line: file.getLineAndCharacterOfPosition(declaration.getStart()).line + 1,
    description: ts.displayPartsToString(original.getDocumentationComment(checker)),
    examples: original
      .getJsDocTags(checker)
      .filter(({ name }) => name === "example")
      .map(({ text }) => ts.displayPartsToString(text)),
    value: Boolean(original.flags & ts.SymbolFlags.Value),
  };
}

/** Finds shared implementation modules that must be documented through their supported facade.
 * @param inventory - Complete public export graph. @param slug - Supported reference owner.
 * @returns Additional source roots and the exact public files to include. */
export function supportingSources(
  inventory: readonly PublicImport[],
  slug: string,
): ReferenceSource[] {
  const owners: Readonly<Record<string, string>> = {
    "packages/contracts": "app",
    "packages/invocation": "functions",
    "packages/local-service": "integrations/local",
    "packages/deploy-pulumi": "integrations/pulumi",
    "packages/observability": "observability-local",
  };
  return Object.entries(owners)
    .filter(([, owner]) => owner === slug)
    .map(([directory]) => ({
      directory,
      files: [
        ...new Set(inventory.flatMap(({ symbols }) => symbols.map(({ source }) => source))),
      ].filter((source) => source.startsWith(`${directory}/src/`)),
    }))
    .filter(({ files }) => files.length > 0);
}

/** Limits new reference pages to publicly reachable source modules; existing pages retain their anchors.
 * @param inventory - Complete export graph. @param slug - Reference being generated.
 * @returns Source selection for a newly documented package, or undefined for existing references. */
export function newlyDocumentedSources(
  inventory: readonly PublicImport[],
  slug: string,
): readonly string[] | undefined {
  if (
    ![
      "provider",
      "providers-local",
      "observability-local",
      "cli-api",
      "create-relkit",
      "relkit",
      "integrations/catalog",
    ].includes(slug)
  )
    return undefined;
  const definition = apiPackageDefinitions.find((entry) => entry.slug === slug)!;
  return [
    ...new Set(
      inventory.flatMap((entry) => [entry.source, ...entry.symbols.map(({ source }) => source)]),
    ),
  ].filter((file) => file.startsWith(`${definition.directory}/src/`));
}
