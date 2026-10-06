import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * Checks a native PostgreSQL consumer, including its dependency declarations.
 *
 * @param source - Consumer source resolved from this package's test directory.
 * @returns All compiler diagnostics; no files or build outputs are written.
 * @remarks Deliberately avoids the repository's skipLibCheck setting so stale
 * dependency imports cannot erase the SQL failure channel unnoticed.
 */
export function checkPostgresConsumer(source: string): readonly ts.Diagnostic[] {
  const filename = fileURLToPath(new URL(".postgres-consumer.ts", import.meta.url));
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: false,
    noEmit: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    types: ["bun"],
  };
  const host = ts.createCompilerHost(options);
  const originalRead = host.readFile.bind(host);
  const originalExists = host.fileExists.bind(host);
  host.readFile = (path) => (path === filename ? source : originalRead(path));
  host.fileExists = (path) => path === filename || originalExists(path);
  return ts.getPreEmitDiagnostics(ts.createProgram([filename], options, host));
}

/**
 * Renders strict compiler failures with file locations for gate evidence.
 *
 * @param diagnostics - Diagnostics returned by the consumer compilation.
 * @returns Human-readable diagnostics, or an empty string for a passing check.
 */
export function formatPostgresDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getCanonicalFileName: (path) => path,
    getNewLine: () => "\n",
  });
}
