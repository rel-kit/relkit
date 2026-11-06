/**
 * `relkit build --target vercel` leaves a placeholder in the public output directory: Vercel refuses
 * a deployment whose output directory is empty, and a project without `public/` has nothing else to
 * put there. Other targets keep the directory as copied.
 */
import { expect, test } from "bun:test";
import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildProject } from "../src/commands/build.js";
import { VERCEL_PUBLIC_PLACEHOLDER } from "../src/commands/build-vercel-public.js";
import {
  copyProject,
  registerCommandCleanup,
} from "../../../tests/fixtures/cli/commands-core-fixture.js";

registerCommandCleanup();

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

test("a Vercel-target build keeps the public output directory non-empty", async () => {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  // What `relkit deploy init vercel` writes for a project without schedules; the build checks it.
  await writeFile(join(root, "vercel.json"), '{ "crons": [] }\n');
  const result = await buildProject({ projectRoot: root, runtime: "node", target: "vercel" });
  expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([]);
  const placeholder = join(root, ".relkit/build/public", VERCEL_PUBLIC_PLACEHOLDER);
  expect(await exists(placeholder)).toBe(true);
  expect(await Bun.file(placeholder).text()).toContain("public/");
});

test("a container build leaves the public directory as the project provides it", async () => {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  await buildProject({ projectRoot: root, runtime: "node" });
  expect(await exists(join(root, ".relkit/build/public"))).toBe(true);
  expect(await exists(join(root, ".relkit/build/public", VERCEL_PUBLIC_PLACEHOLDER))).toBe(false);
});
