import { afterEach, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildProject } from "./src/commands/build.js";
import { startProject } from "./src/commands/start.js";
import { linkWorkspacePackages } from "./test-workspace.js";

const roots: string[] = [];

test("the emitted server rejects missing production environment before provider startup", async () => {
  const root = await copyFullProject();
  const appPath = join(root, "relkit.config.ts");
  const source = await readFile(appPath, "utf8");
  await writeFile(
    appPath,
    source.replace(
      "  SERVICE_PORT: envFactory.port().default(3000),",
      '  SERVICE_PORT: envFactory.port().default(3000),\n  REQUIRED_TOKEN: envFactory.secret().requiredIn("production"),',
    ),
  );
  const built = await buildProject({ projectRoot: root });
  expect(built.ok).toBe(true);
  await expect(
    startProject({
      projectRoot: root,
      port: 0,
      healthTimeoutMs: 1_000,
      environment: { NODE_ENV: "production" },
      spawn: (command, options) => Bun.spawn(command, { ...options, stderr: "inherit" }),
    }),
  ).rejects.toThrow();
});

async function copyFullProject(): Promise<string> {
  const root = await mkdtemp(join(process.cwd(), ".relkit-environment-test-"));
  roots.push(root);
  await cp(join(process.cwd(), "tests/compiler/fixtures/valid-full"), root, { recursive: true });
  await cp(join(process.cwd(), "examples/commerce/package.json"), join(root, "package.json"));
  await linkWorkspacePackages(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
