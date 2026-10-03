import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { generateProject, normalizeCreateOptions } from "create-relkit";
import { checkProject } from "./src/commands/check.js";

const repository = resolve(import.meta.dir, "../..");
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("route type failures retain the last valid manifest and recover after the export is fixed", async () => {
  await mkdir(join(repository, ".relkit"), { recursive: true });
  const parent = await mkdtemp(join(repository, ".relkit/route-check-test-"));
  roots.push(parent);
  const root = join(parent, "app");
  await generateProject(
    normalizeCreateOptions(["app", "--directory", root, "--no-install", "--no-git", "--examples"]),
  );
  // Link the generated project's dependencies without relying on workspace hoisting.
  await mkdir(join(root, "node_modules/@relkit"), { recursive: true });
  await symlink(join(repository, "packages/app"), join(root, "node_modules/@relkit/app"));
  await symlink(join(repository, "packages/testing"), join(root, "node_modules/@relkit/testing"));
  const initial = await checkProject({ projectRoot: root });
  expect(initial.ok, JSON.stringify(initial.diagnostics)).toBe(true);
  const manifest = join(root, ".relkit/generated/runtime.manifest.ts");
  const original = await readFile(manifest, "utf8");
  const route = join(root, "src/routes/users/route.ts");
  await mkdir(join(root, "src/routes/users"));
  const source = `import hello from "@app/hello/service.js";
import { defineServiceRoutes as expose } from "@relkit/app/routes";
export const GET = expose(hello, { GET: "hello" });\n`;
  await writeFile(route, source);
  const failed = await checkProject({ projectRoot: root });
  expect(failed.ok).toBe(false);
  expect(failed.activatable).toBe(false);
  expect(failed.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "RELKIT_ROUTE_EXPORT_METHOD",
      file: "src/routes/users/route.ts",
      line: 3,
      column: 14,
    }),
  );
  expect(failed.diagnostics.some((entry) => entry.code === "RELKIT_ROUTE_MODULE_TYPE")).toBe(true);
  expect(await readFile(manifest, "utf8")).toBe(original);
  expect(await readFile(join(root, ".relkit/generated/route-module-checks.ts"), "utf8")).toContain(
    "src/routes/users/route.ts",
  );
  await writeFile(route, source.replace("export const GET", "export const { GET }"));
  const recovered = await checkProject({ projectRoot: root });
  expect(recovered.ok, JSON.stringify(recovered.diagnostics)).toBe(true);
  expect(recovered.activatable).toBe(true);
  expect(await readFile(manifest, "utf8")).not.toBe(original);
}, 60_000);
