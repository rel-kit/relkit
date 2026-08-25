import { afterEach, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildProject } from "./src/commands/build.js";
import { startProject } from "./src/commands/start.js";

const roots: string[] = [];

test("the emitted server rejects missing production environment before provider startup", async () => {
  const root = await copyFullProject();
  const appPath = join(root, "src/app.ts");
  const source = await readFile(appPath, "utf8");
  await writeFile(
    appPath,
    source.replace(
      "defineEnv({ SERVICE_PORT: envFactory.port().default(3000) })",
      'defineEnv({ SERVICE_PORT: envFactory.port().default(3000), REQUIRED_TOKEN: envFactory.secret().requiredIn("production") })',
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
  const root = await mkdtemp(join(process.cwd(), ".zsys-environment-test-"));
  roots.push(root);
  await cp(join(process.cwd(), "tests/compiler/fixtures/valid-full"), root, { recursive: true });
  await cp(join(process.cwd(), "examples/commerce/package.json"), join(root, "package.json"));
  const scope = join(root, "node_modules", "@zsys");
  await mkdir(scope, { recursive: true });
  for (const name of [
    "agents",
    "app",
    "buckets",
    "cache",
    "cloud-aws",
    "compiler",
    "config",
    "contracts",
    "diagnostics",
    "engine",
    "events",
    "functions",
    "graph",
    "inspector-api",
    "jobs",
    "observability",
    "providers-local",
    "providers-standard",
    "routes",
    "runtime-effect",
    "runtime-hono",
    "schema",
    "supervisor",
    "testing",
    "tools",
  ])
    await symlink(join(process.cwd(), "packages", name), join(scope, name));
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
