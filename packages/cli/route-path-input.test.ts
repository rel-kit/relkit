import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { generateProject, normalizeCreateOptions } from "create-relkit";

const repository = resolve(import.meta.dir, "../..");
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("the real check pipeline rejects an inferred users path without id input", async () => {
  await mkdir(join(repository, ".relkit"), { recursive: true });
  const parent = await mkdtemp(join(repository, ".relkit/path-input-test-"));
  roots.push(parent);
  const root = join(parent, "app");
  await generateProject(
    normalizeCreateOptions(["app", "--directory", root, "--no-install", "--no-git"]),
  );
  // Link the generated project's dependencies without relying on workspace hoisting.
  await mkdir(join(root, "node_modules/@relkit"), { recursive: true });
  await symlink(join(repository, "packages/app"), join(root, "node_modules/@relkit/app"));
  await symlink(join(repository, "packages/testing"), join(root, "node_modules/@relkit/testing"));
  await mkdir(join(root, "src/routes/users/[id]"), { recursive: true });
  await mkdir(join(root, "src/users/functions"), { recursive: true });
  await writeFile(
    join(root, "src/users/functions/example.function.ts"),
    `
import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
const example = defineFunction({ id: "users.example", input: z.object({ value: z.string() }),
  output: z.object({ value: z.string() }), handler: async ({ value }) => ({ value }) });
export default example;`,
  );
  await writeFile(
    join(root, "src/users/service.ts"),
    `
import { defineService } from "@relkit/app/services";
import example from "./functions/example.function.js";
export default defineService({ id: "users", functions: { example } });`,
  );
  await writeFile(
    join(root, "src/routes/users/[id]/route.ts"),
    `
import service from "../../../users/service.js";
import { defineServiceRoutes } from "@relkit/app/routes";
export const { GET } = defineServiceRoutes(service, { GET: "example" });`,
  );
  const command = Bun.spawn(
    [
      process.execPath,
      join(repository, "packages/cli/dist/bin.js"),
      "check",
      "--project-root",
      root,
      "--json",
    ],
    { cwd: root, stdout: "pipe", stderr: "pipe" },
  );
  const [output, errors, exitCode] = await Promise.all([
    new Response(command.stdout).text(),
    new Response(command.stderr).text(),
    command.exited,
  ]);
  expect(exitCode, errors).toBe(1);
  const result = JSON.parse(output);
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(false);
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "RELKIT_MAPPING_INCOMPATIBLE",
      message: expect.stringContaining('"id"'),
    }),
  );
}, 60_000);
