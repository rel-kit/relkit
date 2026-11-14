/**
 * A module that exists only on Bun, imported by application code that the CLI evaluates on Node,
 * is reported at the import with a code naming both ways out, not at line 1 of the file.
 */
import { expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { nodeCli } from "./database/fixture.js";
import {
  bunOnlyImports,
  bunOnlyModule,
  bunRuntimeFailure,
} from "../src/commands/check-runtime-imports.js";
import {
  copyProject,
  registerCommandCleanup,
} from "../../../tests/fixtures/cli/commands-core-fixture.js";

registerCommandCleanup();

const CODE = "RELKIT_EVALUATOR_BUN_RUNTIME_REQUIRED";

test("the Bun-only module list matches bun, bun: modules and Bun driver entries", () => {
  for (const name of ["bun", "bun:sqlite", "drizzle-orm/bun-sql", "drizzle-orm/bun-sqlite/driver"])
    expect(bunOnlyModule(name)).toBe(true);
  for (const name of ["bunny", "drizzle-orm/bun-sqlitex", "drizzle-orm/node-postgres", "node:fs"])
    expect(bunOnlyModule(name)).toBe(false);
});

test("the scan locates static value imports and skips type-only and dynamic ones", () => {
  const text = [
    'import type { Database } from "bun:sqlite";',
    'import { drizzle } from "drizzle-orm/bun-sql";',
    'export { SQL } from "bun";',
    'const lazy = () => import("bun:sqlite");',
    "",
  ].join("\n");
  expect(bunOnlyImports([{ fileName: "src/a.ts", text }])).toEqual([
    { file: "src/a.ts", line: 2, column: 1, specifier: "drizzle-orm/bun-sql" },
    { file: "src/a.ts", line: 3, column: 1, specifier: "bun" },
  ]);
});

test("an evaluator failure from a dependency that loads bun points at the import leading to it", () => {
  const text = 'import { a } from "relkit";\nimport { b } from "@scope/fast-db/client";\n';
  const sources = [{ fileName: "src/db.ts", text }];
  const located = bunRuntimeFailure(
    {
      module: "src/db.ts",
      message:
        "Cannot find package 'bun' imported from /app/node_modules/@scope/fast-db/dist/driver.js",
    },
    sources,
  );
  expect(located).toMatchObject({ code: CODE, file: "src/db.ts", line: 2, column: 1 });
  expect(located?.message).toBe(
    '"@scope/fast-db/client" loads "bun", which exists only on Bun, and this command runs on Node.',
  );
  const unlocated = bunRuntimeFailure(
    { module: "src/db.ts", message: "Received protocol 'bun:'" },
    sources,
  );
  expect(unlocated).toMatchObject({ code: CODE, line: 1, column: 1 });
  expect(unlocated?.message).toContain("so the location is the start of the file");
  expect(bunRuntimeFailure({ module: "src/db.ts", message: "boom" }, sources)).toBeUndefined();
});

for (const specifier of ["bun:sqlite", "drizzle-orm/bun-sql"]) {
  test(`check on Node reports ${specifier} at the import`, async () => {
    const root = await copyProject("tests/compiler/fixtures/valid-minimal");
    const service = join(root, "src/hello/service.ts");
    const lines = (await readFile(service, "utf8")).split("\n");
    lines.splice(1, 0, `import { unused } from "${specifier}";`);
    await writeFile(service, lines.join("\n"));
    const result = await nodeCli(root, ["--json", "check"]);
    expect(result.code).not.toBe(0);
    const diagnostics = JSON.parse(result.stdout).diagnostics;
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: CODE,
        file: "src/hello/service.ts",
        line: 2,
        column: 1,
        message: `"${specifier}" loads only on Bun, and this command runs on Node.`,
      }),
    ]);
  }, 60_000);
}

test("check on Node locates a Bun-only module loaded by a dependency", async () => {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  const helper = join(root, "node_modules/fast-db");
  await mkdir(helper, { recursive: true });
  await writeFile(
    join(helper, "package.json"),
    JSON.stringify({ name: "fast-db", type: "module", exports: "./index.js" }),
  );
  await writeFile(
    join(helper, "index.js"),
    'import { SQL } from "bun";\nexport const sql = SQL;\n',
  );
  const service = join(root, "src/hello/service.ts");
  const lines = (await readFile(service, "utf8")).split("\n");
  lines.splice(1, 0, 'import "fast-db";');
  await writeFile(service, lines.join("\n"));
  const result = await nodeCli(root, ["--json", "check"]);
  const diagnostics = JSON.parse(result.stdout).diagnostics;
  // The route that imports the service fails with the same cause; the located import covers it.
  expect(diagnostics).toEqual([
    expect.objectContaining({
      code: CODE,
      file: "src/hello/service.ts",
      line: 2,
      message: '"fast-db" loads "bun", which exists only on Bun, and this command runs on Node.',
    }),
  ]);
}, 60_000);
