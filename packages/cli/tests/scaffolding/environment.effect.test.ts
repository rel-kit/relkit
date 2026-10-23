/** Verifies CLI-owned environment behavior through retained creator services, preserving typed failures and awaited fixture cleanup. */

import { expect, it } from "@effect/vitest";
import { resolve } from "node:path";
import { Effect } from "effect";
import ts from "typescript";

it.live(
  "compiles positive service examples and detects mutation that erases environment requirements",
  () =>
    Effect.sync(() => {
      const root = process.cwd();
      const fixture = resolve(
        root,
        "packages/cli/tests/scaffolding/generator-environment.probe.ts",
      );
      const configPath = resolve(root, "packages/cli/tsconfig.scaffolding-tests.json");
      const config = ts.readConfigFile(configPath, ts.sys.readFile);
      const parsed = ts.parseJsonConfigFileContent(
        config.config,
        ts.sys,
        resolve(root, "packages/cli"),
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
          : (actual.getSourceFile(file) ?? original(file, language, onError, createNew));
      // Only the fixture changes; reuse its already-parsed dependencies in the mutation check.
      const mutation = ts.createProgram([fixture], parsed.options, host, actual);
      const diagnostics = ts.getPreEmitDiagnostics(mutation);
      expect(diagnostics.filter((error) => error.code === 2578)).toHaveLength(7);
    }),
  15000,
);
