/** Runs native check generation with an accepted compiler exclusion policy while retaining strict selected-config imports. */
import { expect, test } from "bun:test";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Effect } from "effect";
import { checkProjectEffect } from "../src/commands/check.js";
import { CliCompiler } from "../src/services/compiler.service.js";
import { projectCapabilitiesLayer } from "../src/services/project-capabilities.js";
import { configFixture } from "./dependency-preflight.fixture.js";
import {
  copyProject,
  registerCommandCleanup,
} from "../../../tests/fixtures/cli/commands-core-fixture.js";

registerCommandCleanup();

test("an excluded experimental agent does not select unavailable native dependencies", async () => {
  const projectRoot = await projectWithExperimentalAgent();
  const result = await checkWithExcludes(projectRoot, ["src/hello/experimental/**"]);
  expect(result.diagnostics).toEqual([]);
  expect(result.ok).toBe(true);
  expect(result.activatable).toBe(true);
});

test("an active experimental agent still fails its native dependency preflight", async () => {
  const projectRoot = await projectWithExperimentalAgent();
  const result = await checkWithExcludes(projectRoot, ["src/other/**"]);
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result.diagnostics)).toContain("RELKIT_DEPENDENCY_MISSING");
  expect(JSON.stringify(result.diagnostics)).toContain("fixture-missing-sdk");
  expect(JSON.stringify(result.diagnostics)).not.toContain("AUTHORED CONFIG MUST NOT EVALUATE");
});

test("selected configuration imports remain strict beneath an excluded source path", async () => {
  const projectRoot = await projectWithExperimentalAgent();
  const configuration = await readFile(join(projectRoot, "relkit.config.ts"), "utf8");
  const configPath = "src/hello/experimental/custom.config.ts";
  await writeFile(join(projectRoot, configPath), `import "@relkit/langchain";\n${configuration}`);
  const result = await checkWithExcludes(projectRoot, ["src/hello/experimental/**"], configPath);
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result.diagnostics)).toContain("RELKIT_DEPENDENCY_MISSING");
  expect(JSON.stringify(result.diagnostics)).toContain("fixture-missing-sdk");
  expect(JSON.stringify(result.diagnostics)).not.toContain("AUTHORED CONFIG MUST NOT EVALUATE");
});

/**
 * Copies the existing valid application and replaces only its owned LangChain link with hostile metadata.
 * @returns An afterEach-owned project containing a native dependency that must never be evaluated.
 */
async function projectWithExperimentalAgent(): Promise<string> {
  const projectRoot = await copyProject("tests/compiler/fixtures/valid-minimal");
  const integration = await configFixture("langchain", ["agent-execution"], "agent-execution");
  try {
    const target = join(projectRoot, "node_modules/@relkit/langchain");
    await rm(target);
    await cp(integration.directory, target, { recursive: true });
    const source = join(projectRoot, "src/hello/experimental/agent.ts");
    await mkdir(dirname(source), { recursive: true });
    await writeFile(
      source,
      'import { defineAgent } from "@relkit/langchain";\nexport default defineAgent({});\n',
    );
    return projectRoot;
  } finally {
    await rm(integration.root, { recursive: true, force: true });
  }
}

/**
 * Runs the real check pipeline, substituting only its accepted configuration exclusion policy.
 * @param projectRoot - Native application fixture with real compiler, evaluator and filesystem capabilities.
 * @param exclude - Additional accepted source policy, not a new authored tooling-config option.
 * @param configPath - Exact selected configuration remains strict before it can be loaded.
 * @returns Native compilation result and diagnostics after the check generation completes.
 */
function checkWithExcludes(
  projectRoot: string,
  exclude: readonly string[],
  configPath = "relkit.config.ts",
) {
  return Effect.runPromise(
    Effect.gen(function* () {
      const compiler = yield* CliCompiler;
      return yield* checkProjectEffect({ projectRoot, configPath }).pipe(
        Effect.provideService(CliCompiler, {
          ...compiler,
          loadConfig: (...args) =>
            compiler
              .loadConfig(...args)
              .pipe(
                Effect.map((config) => ({ ...config, exclude: [...config.exclude, ...exclude] })),
              ),
        }),
      );
    }).pipe(Effect.provide(projectCapabilitiesLayer)),
  );
}
