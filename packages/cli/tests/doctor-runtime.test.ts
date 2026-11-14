/**
 * `relkit doctor` reports what stops a project from running on the current runtime and package
 * manager: a Bun-only import on Node blocks, while environment files Node does not load and
 * manifest fields the package manager ignores are warnings.
 */
import { expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { nodeCli } from "./database/fixture.js";
import { checkManifestFields } from "../src/commands/doctor-runtime.js";
import {
  copyProject,
  registerCommandCleanup,
} from "../../../tests/fixtures/cli/commands-core-fixture.js";

registerCommandCleanup();

test("doctor on Node reports a Bun-only service, the .env file and npm's ignored fields", async () => {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  const service = join(root, "src/hello/service.ts");
  const lines = (await readFile(service, "utf8")).split("\n");
  lines.splice(1, 0, 'import { drizzle } from "drizzle-orm/bun-sql";');
  await writeFile(service, lines.join("\n"));
  await writeFile(join(root, ".env"), "PORT=4123\n");
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      ...manifest,
      packageManager: "npm@11.6.0",
      devDependencies: { ...manifest.devDependencies, "@relkit/cli": "*" },
      patchedDependencies: { "drizzle-orm@1.0.0": "patches/drizzle-orm.patch" },
    }),
  );
  const result = await nodeCli(root, ["--json", "doctor", "--no-ports", "--no-pulumi"]);
  const checks = new Map<string, { ok: boolean; message: string; details?: unknown }>(
    JSON.parse(result.stdout).checks.map((check: { name: string }) => [check.name, check]),
  );
  expect(result.code).not.toBe(0);
  expect(checks.get("runtime-imports")).toMatchObject({
    ok: false,
    message: expect.stringContaining(
      'src/hello/service.ts:2:1 imports "drizzle-orm/bun-sql", which loads only on Bun',
    ),
    details: { code: "RELKIT_EVALUATOR_BUN_RUNTIME_REQUIRED" },
  });
  expect(checks.get("environment-files")).toMatchObject({
    ok: true,
    message: expect.stringContaining("Node does not load .env by itself."),
    details: { severity: "warning", runtime: "node", loadedByRuntime: false, files: [".env"] },
  });
  expect(checks.get("package-manager")).toMatchObject({
    ok: true,
    message: expect.stringMatching(
      /npm ignores patchedDependencies in package\.json.*npm approve-scripts esbuild/u,
    ),
    details: { severity: "warning", packageManager: "npm" },
  });
}, 120_000);

test("pnpm reads patchedDependencies from pnpm-workspace.yaml, not package.json", () => {
  const check = checkManifestFields("pnpm", { patchedDependencies: { a: "p.patch" } }, false);
  expect(check.message).toBe(
    "pnpm ignores patchedDependencies in package.json; move it to pnpm-workspace.yaml, which does not exist yet.",
  );
  expect(checkManifestFields("bun", { patchedDependencies: { a: "p.patch" } }, false)).toEqual({
    name: "package-manager",
    ok: true,
    message: "bun applies every field in package.json.",
  });
  expect(
    checkManifestFields(
      "npm",
      { devDependencies: { "@relkit/cli": "1" }, allowScripts: { esbuild: true } },
      false,
    ).details,
  ).toBeUndefined();
});
