import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { generateProject, normalizeCreateOptions } from "create-relkit";

const repository = resolve(import.meta.dir, "../..");
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<string> {
  await mkdir(join(repository, ".relkit"), { recursive: true });
  const parent = await mkdtemp(join(repository, ".relkit/route-review-"));
  roots.push(parent);
  const root = join(parent, "app");
  await generateProject(
    normalizeCreateOptions(["app", "--directory", root, "--no-install", "--no-git"]),
  );
  // Link the generated project's dependencies without relying on workspace hoisting.
  await mkdir(join(root, "node_modules/@relkit"), { recursive: true });
  await symlink(join(repository, "packages/app"), join(root, "node_modules/@relkit/app"));
  await symlink(join(repository, "packages/testing"), join(root, "node_modules/@relkit/testing"));
  return root;
}

async function check(root: string) {
  const child = Bun.spawn(
    [
      process.execPath,
      join(repository, "packages/cli/dist/index.js"),
      "check",
      "--project-root",
      root,
      "--json",
    ],
    { cwd: root, stdout: "pipe", stderr: "pipe" },
  );
  const [output, errors, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, result: JSON.parse(output), errors };
}

test("the real CLI accepts annotated explicit path mappings and still rejects missing inferred inputs", async () => {
  const root = await fixture();
  await mkdir(join(root, "src/users/functions"), { recursive: true });
  await mkdir(join(root, "src/routes/users/[id]"), { recursive: true });
  await writeFile(
    join(root, "src/users/functions/example.function.ts"),
    `
import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
export default defineFunction({ id: "users.example", input: z.object({ value: z.string() }),
  output: z.object({ value: z.string() }), handler: async ({ value }) => ({ value }) });`,
  );
  await writeFile(
    join(root, "src/users/service.ts"),
    `
import { defineService } from "@relkit/app/services";
import example from "./functions/example.function.js";
export default defineService({ id: "users", functions: { example } });`,
  );
  const route = join(root, "src/routes/users/[id]/route.ts");
  const prefix = `import service from "../../../users/service.js";
import { defineServiceRoutes, http, type ServiceRouteOptions } from "@relkit/app/routes";`;
  await writeFile(
    route,
    `${prefix}
const mapped: ServiceRouteOptions<"example", typeof service.example> = {
  member: "example", request: http.input({ value: http.path("id") })
};
export const { GET } = defineServiceRoutes(service, { GET: mapped });`,
  );
  const accepted = await check(root);
  expect(accepted.exitCode, accepted.errors || JSON.stringify(accepted.result.diagnostics)).toBe(0);
  expect(accepted.result).toMatchObject({ ok: true, activatable: true, diagnostics: [] });
  const graph = JSON.parse(
    await readFile(join(root, ".relkit/generated/application.graph.json"), "utf8"),
  );
  const node = graph.nodes.find(
    (entry: { kind: string; targetFunctionId?: string }) =>
      entry.kind === "trigger" && entry.targetFunctionId === "users.example",
  );
  expect(node?.config.request).toMatchObject({
    kind: "input",
    fields: { value: { kind: "path", name: "id" } },
  });
  const manifestPath = join(root, ".relkit/generated/runtime.manifest.ts");
  const manifest = await readFile(manifestPath, "utf8");
  await writeFile(
    route,
    `${prefix}
export const { GET } = defineServiceRoutes(service, { GET: "example" });`,
  );
  const rejected = await check(root);
  expect(rejected.exitCode).toBe(1);
  expect(rejected.result).toMatchObject({ ok: false, activatable: false });
  expect(rejected.result.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "RELKIT_MAPPING_INCOMPATIBLE",
      message: expect.stringContaining('"id"'),
    }),
  );
  expect(await readFile(manifestPath, "utf8")).toBe(manifest);
}, 60_000);

test("the real CLI ignores excluded route fixtures without suppressing invalid application routes", async () => {
  const root = await fixture();
  const original = await check(root);
  expect(original.exitCode, original.errors || JSON.stringify(original.result.diagnostics)).toBe(0);
  const fixtureFiles = ["src/routes/__fixtures__/route.ts", "src/routes/users/__tests__/route.ts"];
  for (const file of fixtureFiles) {
    await mkdir(join(root, file, ".."), { recursive: true });
    await writeFile(join(root, file), 'export const GET = "fixture data";\n');
  }
  const accepted = await check(root);
  expect(accepted.exitCode, accepted.errors || JSON.stringify(accepted.result.diagnostics)).toBe(0);
  expect(accepted.result).toMatchObject({ ok: true, activatable: true, diagnostics: [] });
  expect(accepted.result.graphHash).toBe(original.result.graphHash);
  const checks = await readFile(join(root, ".relkit/generated/route-module-checks.ts"), "utf8");
  for (const file of fixtureFiles) expect(checks).not.toContain(file);
  const manifestPath = join(root, ".relkit/generated/runtime.manifest.ts");
  const manifest = await readFile(manifestPath, "utf8");
  const route = join(root, "src/routes/invalid/route.ts");
  await mkdir(join(root, "src/routes/invalid"), { recursive: true });
  await writeFile(route, 'export const GET = "invalid application route";\n');
  const rejected = await check(root);
  expect(rejected.exitCode).toBe(1);
  expect(rejected.result).toMatchObject({ ok: false, activatable: false });
  expect(rejected.result.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "RELKIT_ROUTE_MODULE_TYPE",
      file: "src/routes/invalid/route.ts",
    }),
  );
  expect(await readFile(manifestPath, "utf8")).toBe(manifest);
}, 60_000);
