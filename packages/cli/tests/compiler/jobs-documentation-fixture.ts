/** Reads original compiler TSDoc consumers and checks them against the strict installed TypeScript/Effect API without emitting repository files. */
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";

/** Collects original executable TSDoc snippets with their documented caller-owned inputs.
 * @param root - Absolute original compiler source directory with a trailing separator.
 * @returns Virtual source files retaining every original code example.
 */
export function compilerDocumentationExamples(root: string): Map<string, string> {
  const examples = new Map<string, string>();
  for (const directory of [root, `${root}discovery/`, `${root}jobs/`]) {
    for (const file of readdirSync(directory).filter((name) => name.endsWith(".ts"))) {
      const source = readFileSync(`${directory}${file}`, "utf8");
      for (const [index, match] of [
        ...source.matchAll(/@example\s*\n(?:\s*\*[^\n]*\n)*?\s*\* ```ts\n([\s\S]*?)\s*\* ```/g),
      ].entries()) {
        if (match[1] === undefined) continue;
        const code = match[1].replace(/^\s*\* ?/gm, "");
        examples.set(
          `${directory}.documentation-${file}-${index}.ts`,
          [
            `import type { NormalizationWork, NormalizedDescriptor, GeneratedOutputs } from ${JSON.stringify(`${root}normalize-types.js`)};`,
            `import type { JobsManifestWorkerEntry } from ${JSON.stringify(`${root}jobs/manifest.types.js`)};`,
            "declare const work: NormalizationWork;",
            "declare const task: NormalizedDescriptor;",
            "declare const job: NormalizedDescriptor;",
            "declare const entries: readonly JobsManifestWorkerEntry[];",
            "declare const outputs: GeneratedOutputs;",
            code,
          ].join("\n"),
        );
      }
    }
  }
  return examples;
}

/** Checks all virtual examples with the original repository compiler policy and complete installed dependencies.
 * @param examples - Unmodified original TSDoc snippets plus documented input declarations.
 * @param configPath - Original shared compiler configuration.
 * @returns Exact native formatted diagnostics, empty only when the full program passes.
 */
export function compilerDocumentationDiagnostics(
  examples: ReadonlyMap<string, string>,
  configPath: string,
): string {
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const options = ts.convertCompilerOptionsFromJson(
    config.config.compilerOptions,
    ts.sys.getCurrentDirectory(),
  ).options;
  Object.assign(options, {
    composite: false,
    declaration: false,
    declarationMap: false,
    noEmit: true,
  });
  const host = ts.createCompilerHost(options);
  const originalRead = host.readFile.bind(host);
  const originalExists = host.fileExists.bind(host);
  host.readFile = (path) => examples.get(path) ?? originalRead(path);
  host.fileExists = (path) => examples.has(path) || originalExists(path);
  const program = ts.createProgram([...examples.keys()], options, host);
  return ts.formatDiagnosticsWithColorAndContext(ts.getPreEmitDiagnostics(program), {
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getCanonicalFileName: (path) => path,
    getNewLine: () => "\n",
  });
}
