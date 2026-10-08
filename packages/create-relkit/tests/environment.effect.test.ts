import { expect, it } from "@effect/vitest";
import { resolve } from "node:path";
import { Effect } from "effect";
import ts from "typescript";

it.live(
  "compiles positive service examples and detects mutation that erases environment requirements",
  () =>
    Effect.sync(() => {
      const root = process.cwd();
      const fixture = resolve(root, "packages/create-relkit/tests/generator-environment.probe.ts");
      const configPath = resolve(root, "packages/create-relkit/tsconfig.tests.json");
      const config = ts.readConfigFile(configPath, ts.sys.readFile);
      const parsed = ts.parseJsonConfigFileContent(
        config.config,
        ts.sys,
        resolve(root, "packages/create-relkit"),
      );
      const actual = ts.createProgram([fixture], parsed.options);
      expect(ts.getPreEmitDiagnostics(actual).map((error) => error.code)).toEqual([]);
      const source = ts.sys.readFile(fixture);
      expect(source).toBeDefined();
      if (source === undefined) throw new Error("Missing compiler probe.");
      const mutated =
        "declare const eraseRequirements: <A, E, R>(effect: Effect.Effect<A, E, R>) => Promise<A>;\n" +
        source.replaceAll("Effect.runPromise", "eraseRequirements");
      const host = ts.createCompilerHost(parsed.options);
      const original = host.getSourceFile.bind(host);
      host.getSourceFile = (file, language, onError, createNew) =>
        resolve(file) === fixture
          ? ts.createSourceFile(
              file,
              mutated,
              typeof language === "number" ? language : language.languageVersion,
              true,
            )
          : original(file, language, onError, createNew);
      const mutation = ts.createProgram([fixture], parsed.options, host);
      const diagnostics = ts.getPreEmitDiagnostics(mutation);
      expect(diagnostics.filter((error) => error.code === 2578)).toHaveLength(7);
    }),
  15000,
);
