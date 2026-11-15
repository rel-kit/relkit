/**
 * A file that fails to load is the one error `relkit check` reports: the type check would run
 * against placeholder registries and add errors that only follow from the failure.
 */
import { expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { checkProject } from "../src/commands/check.js";
import { runCli } from "../src/main.js";
import {
  copyProject,
  registerCommandCleanup,
} from "../../../tests/fixtures/cli/commands-core-fixture.js";

registerCommandCleanup();

test("check reports one error for one file that fails to load", async () => {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  await writeFile(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: "preserve",
        moduleResolution: "bundler",
        target: "es2022",
        skipLibCheck: true,
      },
      include: ["src", "relkit.config.ts"],
    }),
  );
  const service = join(root, "src/hello/service.ts");
  await writeFile(
    service,
    `import "missing-database-driver";\n${await readFile(service, "utf8")}\n// Stands for the errors that placeholder registries cause while the file cannot load.\nexport const port: number = "3000";\n`,
  );
  const result = await checkProject({ projectRoot: root });
  expect(result.ok).toBe(false);
  expect(result.diagnostics).toEqual([
    expect.objectContaining({
      code: "RELKIT_EVALUATOR_IMPORT_FAILED",
      file: "src/hello/service.ts",
      message: expect.stringContaining("missing-database-driver"),
    }),
  ]);
  // Without a graph, `relkit graph` refers to that failed check instead of only asking for one.
  const stderr: string[] = [];
  const code = await runCli(["graph", "print", "--project-root", root], {
    cwd: root,
    installSignalHandlers: false,
    io: { stdout: () => undefined, stderr: (line) => stderr.push(line) },
  });
  expect(code).not.toBe(0);
  const output = stderr.join("\n");
  expect(output).toContain("RELKIT_GRAPH_NOT_FOUND");
  expect(output).toContain(
    "The last relkit check failed with 1 error; the first is src/hello/service.ts:1:1 RELKIT_EVALUATOR_IMPORT_FAILED:",
  );
}, 60_000);
