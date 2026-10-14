/** Exercises native flat CLI compatibility, portable diagnostics and preservation of the last valid graph. */
import { expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { checkProject } from "./src/commands/check.js";

import { runCli } from "./src/main.js";

import { copyProject } from "../../tests/fixtures/cli/commands-core-fixture.js";
import { registerCommandCleanup } from "../../tests/fixtures/cli/commands-core-fixture.js";

registerCommandCleanup();

test("check emits activatable success and portable structured diagnostics on failure", async () => {
  const validRoot = await copyProject("tests/compiler/fixtures/valid-minimal");
  const valid = await checkProject({ projectRoot: validRoot });
  expect(valid.ok).toBe(true);
  expect(valid.activatable).toBe(true);
  expect(valid.graphHash).toMatch(/^sha256:/);
  expect(await readFile(join(valid.generatedDirectory, "event-registry.d.ts"), "utf8")).toContain(
    "interface EventRegistry",
  );
  expect(JSON.parse(await readFile(join(valid.generatedDirectory, "diagnostics.json")))).toEqual(
    [],
  );

  const stdout: string[] = [];
  expect(
    await runCli(["check", "--project-root", validRoot], {
      io: { stdout: (line) => stdout.push(line), stderr: () => undefined },
      installSignalHandlers: false,
    }),
  ).toBe(0);
  expect(stdout).toEqual([`Checked ${validRoot}`]);

  const invalidRoot = await copyProject("tests/compiler/fixtures/error-duplicate-id");
  const invalid = await checkProject({ projectRoot: invalidRoot });
  expect(invalid.ok).toBe(false);
  expect(invalid.activatable).toBe(false);
  expect(invalid.outputs.manifest).toBe("");
  expect(invalid.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "RELKIT_DUPLICATE_ID",
      severity: "error",
      file: "src/duplicate/functions/second.function.ts",
      related: [expect.objectContaining({ file: "src/duplicate/functions/first.function.ts" })],
    }),
  );
  expect(JSON.stringify(invalid.diagnostics)).not.toContain(invalidRoot);
});

test("failed checks preserve the last valid graph and update diagnostics", async () => {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  const valid = await checkProject({ projectRoot: root });
  const graphPath = join(valid.generatedDirectory, "application.graph.json");
  const graph = await readFile(graphPath, "utf8");
  await writeFile(
    join(root, "src/routes/hello/[name]/route.ts"),
    'import { defineRoute } from "@relkit/app";\nexport default defineRoute({});\n',
  );

  const invalid = await checkProject({ projectRoot: root });

  expect(invalid.ok).toBe(false);
  expect(await readFile(graphPath, "utf8")).toBe(graph);
  expect(
    JSON.parse(await readFile(join(valid.generatedDirectory, "diagnostics.json"), "utf8")),
  ).toEqual(expect.arrayContaining([expect.objectContaining({ severity: "error" })]));
});

test("dev compile failures identify the source and suggested fix", async () => {
  const root = await copyProject("tests/compiler/fixtures/error-ambiguous-id");
  const stderr: string[] = [];
  const exitCode = await runCli(["dev", "--project-root", root, "--no-color"], {
    installSignalHandlers: false,
    io: { stdout: () => undefined, stderr: (line) => stderr.push(line) },
  });

  expect(exitCode).toBe(1);
  expect(stderr.join("\n")).toContain(
    "src/ambiguous/functions/ambiguous.function.ts:11:16 - error RELKIT_ID_INFERENCE_AMBIGUOUS",
  );
  expect(stderr.join("\n")).toContain("suggestion: Provide an explicit id");
  expect(stderr.join("\n")).toContain("> 11 |");
});

test("check locates removed config keys and shows the fixed replacement", async () => {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  await writeFile(
    join(root, "relkit.config.ts"),
    'export default {\n  source: ["lib/**/*.ts"],\n};\n',
  );

  const result = await checkProject({ projectRoot: root });
  expect(result.ok).toBe(false);
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "RELKIT_CONFIG_LEGACY_KEY",
      file: "relkit.config.ts",
      line: 2,
      column: 3,
      message: expect.stringContaining('RELKIT always discovers "src/**/*.ts"'),
    }),
  );
  expect(result.diagnostics[0]?.message).toContain("defineApp({ env: defineEnv({})");
});
