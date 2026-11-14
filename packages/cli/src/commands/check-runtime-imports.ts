/**
 * Finds application imports of modules that load only on Bun, so a command running on Node can
 * report them at the import instead of letting the evaluator fail at the top of the file. The scan
 * reads source text only; it never resolves or loads a module.
 */
import { createDiagnostic, type Diagnostic } from "relkit/diagnostics";
import ts from "../typescript-parser.js";

/** Code of a module that needs Bun, reported when the command runs on Node. */
export const BUN_RUNTIME_REQUIRED = "RELKIT_EVALUATOR_BUN_RUNTIME_REQUIRED";

/**
 * Modules that exist only on Bun. An entry ending in `:` matches by prefix (`bun:sqlite`); any
 * other entry matches itself and its subpaths (`drizzle-orm/bun-sql/mysql`). Extend the list when
 * another Bun-only driver entry is found.
 */
export const BUN_ONLY_MODULES: readonly string[] = Object.freeze([
  "bun",
  "bun:",
  "drizzle-orm/bun-sql",
  "drizzle-orm/bun-sqlite",
]);

/** One import of a Bun-only module, located in the importing file. */
export interface RuntimeImportFinding {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly specifier: string;
}

/** Source text of one application file, with its project-relative name. */
interface SourceText {
  readonly fileName: string;
  readonly text: string;
}

/**
 * Tells whether a module specifier names a module that loads only on Bun.
 * @param specifier - Module specifier as written in the import.
 * @returns Whether the specifier matches an entry of {@link BUN_ONLY_MODULES}.
 * @example bunOnlyModule("bun:sqlite"); // true
 */
export function bunOnlyModule(specifier: string): boolean {
  return BUN_ONLY_MODULES.some((entry) =>
    entry.endsWith(":")
      ? specifier.startsWith(entry)
      : specifier === entry || specifier.startsWith(`${entry}/`),
  );
}

/**
 * Lists every module import of a file in source order, with its one-based location.
 * @param source - Application file.
 * @param dynamic - Whether `import("…")` calls with a literal specifier are included.
 * @returns Static value imports and re-exports (type-only ones are skipped), then dynamic imports.
 */
export function moduleImports(source: SourceText, dynamic = false): RuntimeImportFinding[] {
  const file = ts.createSourceFile(source.fileName, source.text, ts.ScriptTarget.Latest, true);
  const found: { position: number; specifier: string }[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (node.importClause?.isTypeOnly !== true)
        found.push({ position: node.getStart(file), specifier: node.moduleSpecifier.text });
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      if (!node.isTypeOnly)
        found.push({ position: node.getStart(file), specifier: node.moduleSpecifier.text });
    } else if (
      dynamic &&
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      found.push({ position: node.getStart(file), specifier: node.arguments[0].text });
    }
    if (dynamic) ts.forEachChild(node, visit);
  };
  for (const statement of file.statements) visit(statement);
  return found.map(({ position, specifier }) => {
    const { line, character } = file.getLineAndCharacterOfPosition(position);
    return { file: source.fileName, line: line + 1, column: character + 1, specifier };
  });
}

/**
 * Finds static imports of Bun-only modules. Dynamic imports are left to the evaluator, since code
 * that selects a module by runtime imports it that way.
 * @param sources - Application files that the evaluator would load.
 * @returns Findings in file order, then source order.
 */
export function bunOnlyImports(sources: readonly SourceText[]): RuntimeImportFinding[] {
  return sources.flatMap((source) =>
    source.text.includes("bun")
      ? moduleImports(source).filter((entry) => bunOnlyModule(entry.specifier))
      : [],
  );
}

/**
 * Recognizes an evaluator failure caused by a Bun-only module that the import scan could not see:
 * one loaded by a dependency, or through a dynamic import.
 * @param failure - Evaluator failure of one application file.
 * @param sources - Application files, used to find the import that leads to the module.
 * @returns A diagnostic at the leading import, at the start of the file with a message that says
 * so when no import can be singled out, or undefined when the failure has another cause.
 */
export function bunRuntimeFailure(
  failure: { readonly message: string; readonly module?: string },
  sources: readonly SourceText[],
): Diagnostic | undefined {
  const missing = /Cannot find (?:package|module) '(bun(?::[\w-]+)?)' imported from (\S+)/u.exec(
    failure.message,
  );
  const scheme = /Received protocol 'bun:'|ERR_UNSUPPORTED_ESM_URL_SCHEME/u.test(failure.message);
  if (missing === null && !scheme) return undefined;
  if (failure.module === undefined) return undefined;
  const through = missing?.[1] ?? "bun:";
  const importer = missing === null ? undefined : packageOf(missing[2]!);
  const source = sources.find((entry) => entry.fileName === failure.module);
  const imports = source === undefined ? [] : moduleImports(source, true);
  const leading =
    imports.find((entry) => bunOnlyModule(entry.specifier)) ??
    (importer === undefined
      ? undefined
      : imports.find(
          (entry) => entry.specifier === importer || entry.specifier.startsWith(`${importer}/`),
        ));
  if (leading !== undefined) return bunRuntimeDiagnostic(leading, through);
  const diagnostic = createDiagnostic({
    code: BUN_RUNTIME_REQUIRED,
    severity: "error",
    message: `${failure.module} loads "${through}", which exists only on Bun, and this command runs on Node. RelKit could not tell which import of this file leads to it, so the location is the start of the file.`,
    file: failure.module,
    line: 1,
    column: 1,
  });
  unlocated.add(diagnostic);
  return diagnostic;
}

/** Diagnostics placed at the start of a file because no import could be singled out. */
const unlocated = new WeakSet<Diagnostic>();

/**
 * Recognizes Bun-only module failures across one evaluation. When one file's failure is located at
 * its import, the same module failing in files that only import that file adds nothing: those
 * unlocated failures are covered by it.
 * @param failures - Evaluator failures in order.
 * @param sources - Application files.
 * @returns Per failure, its diagnostic, `"covered"` when another failure reports it, or undefined
 * when the failure has another cause.
 */
export function bunRuntimeFailures(
  failures: readonly { readonly message: string; readonly module?: string }[],
  sources: readonly SourceText[],
): readonly (Diagnostic | "covered" | undefined)[] {
  const found = failures.map((failure) => bunRuntimeFailure(failure, sources));
  const located = found.some((entry) => entry !== undefined && !unlocated.has(entry));
  return found.map((entry) =>
    entry !== undefined && located && unlocated.has(entry) ? "covered" : entry,
  );
}

/**
 * Names the installed package that holds a file.
 * @param path - File path or URL from a module resolution error.
 * @returns `name` or `@scope/name` after the last `node_modules`, or undefined outside one.
 */
function packageOf(path: string): string | undefined {
  const parts = path.replaceAll("\\", "/").split("/node_modules/");
  if (parts.length < 2) return undefined;
  const segments = parts.at(-1)!.split("/");
  return segments[0]?.startsWith("@") ? `${segments[0]}/${segments[1]}` : segments[0];
}

/**
 * Reports an import of a Bun-only module when the command runs on Node.
 * @param finding - Located import.
 * @param through - Bun module the imported package loads, when it is not the specifier itself.
 * @returns Error diagnostic at the import; the catalogue entry names both ways out.
 */
export function bunRuntimeDiagnostic(finding: RuntimeImportFinding, through?: string): Diagnostic {
  const loads =
    through === undefined || through === finding.specifier
      ? `"${finding.specifier}" loads only on Bun`
      : `"${finding.specifier}" loads "${through}", which exists only on Bun`;
  return createDiagnostic({
    code: BUN_RUNTIME_REQUIRED,
    severity: "error",
    message: `${loads}, and this command runs on Node.`,
    file: finding.file,
    line: finding.line,
    column: finding.column,
  });
}
