import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { versionChecks } from "../../packages/cli/src/commands/doctor-compat.js";
import { useWorkspaceDependencies } from "../../packages/cli/src/local.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("local create replaces only ZSYS package versions with Bun links", async () => {
  const root = await mkdtemp(join(tmpdir(), "zsys-local-workspace-"));
  roots.push(root);
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({
      dependencies: { "@zsys/app": "0.0.0", hono: "4.11.7" },
      devDependencies: { "@zsys/cli": "0.0.0", typescript: "5.9.2" },
    })}\n`,
  );

  const names = await useWorkspaceDependencies(root);
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

  expect(names).toContain("@zsys/app");
  expect(names).toContain("@zsys/cli");
  expect(names).toContain("@zsys/engine");
  expect(manifest.dependencies).toEqual({ "@zsys/app": "link:@zsys/app", hono: "4.11.7" });
  expect(manifest.devDependencies).toMatchObject({
    "@zsys/cli": "link:@zsys/cli",
    "@zsys/engine": "link:@zsys/engine",
    typescript: "5.9.2",
  });
});

test("doctor accepts local ZSYS package links", async () => {
  const checks = await versionChecks(
    {
      packageManager: `bun@${Bun.version}`,
      dependencies: { "@zsys/app": "link:@zsys/app" },
      devDependencies: { "@zsys/cli": "link:@zsys/cli", typescript: "5.9.2" },
    },
    process.cwd(),
  );

  expect(checks.find((check) => check.name === "zsys-packages")?.ok).toBe(true);
});
