/**
 * `relkit check` runs the project's compiler as a separate process. These cases pin the output
 * shapes TypeScript 5.9's `tsc` and TypeScript 7's native `tsc` print with `--pretty false`, and
 * the executable lookup for a TypeScript 7 package, whose `exports` hide `bin/tsc`.
 */
import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCompilerOutput } from "../../src/compiler/typescript-compiler-output.js";
import { projectCompilerCommand } from "../../src/compiler/typescript-compiler.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("located diagnostics keep their continuation lines", () => {
  const output = [
    "src/a.ts(3,7): error TS2322: Type 'string' is not assignable to type 'number'.",
    ".relkit/generated/route-module-checks.ts(13,69): error TS2344: Type 'Route0' does not satisfy the constraint.",
    "  Types of property 'POST' are incompatible.",
    "    Property '__relkit_service_route_method' is optional.",
    "src/b.ts(1,1): warning TS6133: 'x' is declared but its value is never read.",
    "",
    "Found 3 errors in 3 files.",
    "",
  ].join("\n");
  expect(parseCompilerOutput(output)).toEqual([
    {
      code: "TS2322",
      severity: "error",
      message: "Type 'string' is not assignable to type 'number'.",
      location: { file: "src/a.ts", line: 3, column: 7 },
    },
    {
      code: "TS2344",
      severity: "error",
      message:
        "Type 'Route0' does not satisfy the constraint.\n  Types of property 'POST' are incompatible.\n    Property '__relkit_service_route_method' is optional.",
      location: { file: ".relkit/generated/route-module-checks.ts", line: 13, column: 69 },
    },
    {
      code: "TS6133",
      severity: "warning",
      message: "'x' is declared but its value is never read.",
      location: { file: "src/b.ts", line: 1, column: 1 },
    },
  ]);
});

test("configuration diagnostics without a file are kept, as TypeScript 7 prints them", () => {
  const output = [
    "error TS6053: File '/app/.relkit/generated/route-module-checks.ts' not found.",
    "  The file is in the program because:",
    "    Part of 'files' list in tsconfig.json",
    "tsconfig.json(7,5): error TS5102: Option 'baseUrl' has been removed. Please remove it from your configuration.",
    '  Use \'"paths": {"*": ["./*"]}\' instead.',
  ].join("\n");
  const [missing, removed] = parseCompilerOutput(output);
  expect(missing).toEqual({
    code: "TS6053",
    severity: "error",
    message:
      "File '/app/.relkit/generated/route-module-checks.ts' not found.\n  The file is in the program because:\n    Part of 'files' list in tsconfig.json",
  });
  expect(removed?.location).toEqual({ file: "tsconfig.json", line: 7, column: 5 });
  expect(removed?.message).toContain("Option 'baseUrl' has been removed.");
});

test("the TypeScript 7 executable is read from the package manifest", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "relkit-compiler-lookup-")));
  roots.push(root);
  const typescript = join(root, "node_modules/typescript");
  await mkdir(join(typescript, "bin"), { recursive: true });
  await writeFile(
    join(typescript, "package.json"),
    JSON.stringify({
      name: "typescript",
      version: "7.0.2",
      bin: { tsc: "bin/tsc" },
      exports: { ".": "./lib/version.cjs", "./package.json": "./package.json" },
    }),
  );
  await writeFile(join(typescript, "bin/tsc"), '#!/usr/bin/env node\nimport "../lib/tsc.js";\n');
  expect(projectCompilerCommand(root)).toEqual([process.execPath, join(typescript, "bin/tsc")]);
  await mkdir(join(root, "node_modules/.bin"), { recursive: true });
  await writeFile(join(root, "node_modules/.bin/tsgo"), "");
  expect(projectCompilerCommand(root)).toEqual([join(root, "node_modules/.bin/tsgo")]);
});

test("a project without TypeScript has no compiler", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-compiler-lookup-"));
  roots.push(root);
  expect(projectCompilerCommand(root)).toBeUndefined();
});
