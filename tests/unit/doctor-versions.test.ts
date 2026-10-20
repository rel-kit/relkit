import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { versionChecks } from "../../packages/cli/src/commands/doctor-compat.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture(packages: Readonly<Record<string, unknown>>) {
  const root = await mkdtemp(join(tmpdir(), "relkit-doctor-versions-"));
  roots.push(root);
  for (const [name, version] of Object.entries(packages)) {
    const directory = join(root, "node_modules", name);
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ name, version, exports: {} }),
    );
  }
  return root;
}

async function check(root: string, dependencies: Readonly<Record<string, string>>) {
  return (await versionChecks({ dependencies }, root)).find(
    (result) => result.name === "relkit-packages",
  );
}

test("doctor accepts independently versioned packages with closed metadata exports", async () => {
  const root = await fixture({ "@relkit/app": "0.7.9", "@relkit/cli": "0.7.10" });
  expect(await check(root, { "@relkit/app": "0.7.9", "@relkit/cli": "^0.7.10" })).toMatchObject({
    ok: true,
  });
});

test("doctor rejects a wrong installed version even when declarations match each other", async () => {
  const root = await fixture({ "@relkit/app": "0.7.8", "@relkit/cli": "0.7.9" });
  expect(await check(root, { "@relkit/app": "0.7.9", "@relkit/cli": "0.7.9" })).toMatchObject({
    ok: false,
  });
});

test("doctor rejects missing packages and malformed installed versions", async () => {
  const root = await fixture({ "@relkit/app": 7 });
  expect(await check(root, { "@relkit/app": "0.7.9" })).toMatchObject({ ok: false });
  expect(await check(root, { "@relkit/missing": "0.7.9" })).toMatchObject({ ok: false });
});

test("doctor resolves hoisted packages from the project and preserves local links", async () => {
  const root = await fixture({ "@relkit/app": "0.7.9", relkit: "0.7.10" });
  const project = join(root, "apps", "api");
  await mkdir(project, { recursive: true });
  expect(await check(project, { "@relkit/app": "~0.7.9", relkit: "0.7.10" })).toMatchObject({
    ok: true,
  });
  expect(await check(project, { "@relkit/app": "0.7.10", relkit: "0.7.9" })).toMatchObject({
    ok: false,
  });
  expect(
    await check(project, { "@relkit/app": "workspace:*", "@relkit/cli": "link:@relkit/cli" }),
  ).toMatchObject({ ok: true });
});

test("doctor validates independently resolved catalog pins", async () => {
  const root = await fixture({ "@relkit/app": "0.7.9", "@relkit/cli": "0.7.10" });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      workspaces: { catalog: { "@relkit/app": "0.7.9", "@relkit/cli": "0.7.10" } },
    }),
  );
  expect(await check(root, { "@relkit/app": "catalog:", "@relkit/cli": "catalog:" })).toMatchObject(
    { ok: true },
  );
});

test("doctor does not hide a broken nearer installation behind a valid hoisted one", async () => {
  const root = await fixture({ "@relkit/app": "0.7.9" });
  const project = join(root, "apps", "api");
  const directory = join(project, "node_modules", "@relkit/app");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "package.json"), "broken JSON");
  expect(await check(project, { "@relkit/app": "0.7.9" })).toMatchObject({ ok: false });
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({ name: "@relkit/other", version: "0.7.9" }),
  );
  expect(await check(project, { "@relkit/app": "0.7.9" })).toMatchObject({ ok: false });
});
