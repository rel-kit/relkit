import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import ts from "typescript";

describe("compiler documentation examples", () => {
  it.effect("typechecks the actual TSDoc snippets against the installed API", () =>
    Effect.sync(() => {
      const root = fileURLToPath(new URL("../src/", import.meta.url));
      const examples = new Map<string, string>();
      for (const directory of [root, `${root}discovery/`, `${root}jobs/`]) {
        for (const file of readdirSync(directory).filter((name) => name.endsWith(".ts"))) {
          const source = readFileSync(`${directory}${file}`, "utf8");
          for (const [index, match] of [
            ...source.matchAll(/@example\s*\n(?:\s*\*[^\n]*\n)*?\s*\* ```ts\n([\s\S]*?)\s*\* ```/g),
          ].entries()) {
            if (match[1] === undefined) continue;
            const code = match[1].replace(/^\s*\* ?/gm, "");
            // Snippets explicitly assume these caller-owned, normalized inputs.
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
      expect(examples.size).toBeGreaterThan(0);
      const configPath = fileURLToPath(new URL("../../../tsconfig.base.json", import.meta.url));
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
      const diagnostics = ts.getPreEmitDiagnostics(program);
      expect(
        ts.formatDiagnosticsWithColorAndContext(diagnostics, {
          getCurrentDirectory: ts.sys.getCurrentDirectory,
          getCanonicalFileName: (path) => path,
          getNewLine: () => "\n",
        }),
      ).toBe("");
    }),
  );
});
