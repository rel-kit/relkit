import { access, readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
export type Manifest = {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  [key: string]: unknown;
};
type Snapshot = Record<string, { mode: number; content: string }>;
export async function runCommand(
  args: string[],
  cwd: string,
  registry?: string,
  cacheDir?: string,
): Promise<string> {
  const child = Bun.spawn([process.execPath, ...args], {
    cwd,
    env: {
      ...process.env,
      ...(registry === undefined
        ? {}
        : { BUN_CONFIG_REGISTRY: registry, npm_config_registry: registry }),
      ...(cacheDir === undefined ? {} : { BUN_INSTALL_CACHE_DIR: cacheDir }),
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`${args.join(" ")} failed in ${cwd}\n${stdout}${stderr}`);
  return stdout;
}
export async function snapshotProject(root: string, current = root): Promise<Snapshot> {
  const result: Snapshot = {};
  for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (["node_modules", ".git", ".next", "bun.lock"].includes(entry.name)) continue;
    const path = join(current, entry.name);
    if (entry.isDirectory()) Object.assign(result, await snapshotProject(root, path));
    else if (entry.isFile()) {
      const name = relative(root, path).replaceAll("\\", "/");
      if (name === ".relkit/build/server/index.js") continue;
      const bytes = await readFile(path);
      const text = /\.(?:json|lock|md|toml|ts|tsx|js|jsx|yaml|yml)$/.test(name);
      result[name] = {
        mode: (await stat(path)).mode & 0o777,
        content: text
          ? bytes.toString("utf8").replaceAll(root, "<project>")
          : Buffer.from(bytes).toString("base64"),
      };
    }
  }
  return result;
}
export async function verifyProject(
  root: string,
  registry: string,
  cacheDir: string,
  exercise?: (port: number) => Promise<void>,
): Promise<void> {
  const taskProject = existsSync(join(root, "src/orders/tasks/export-orders.task.ts"));
  const required = taskProject
    ? [
        "src/orders/functions/health.function.ts",
        "src/orders/service.ts",
        "src/orders/tasks/export-orders.task.ts",
        "src/orders/jobs/export-orders.job.ts",
        "src/routes/health/route.ts",
        "tests/unit/export-orders.task.test.ts",
      ]
    : [
        "src/hello/functions/hello.function.ts",
        "src/hello/service.ts",
        "src/routes/hello/route.ts",
        "tests/integration/hello.route.test.ts",
      ];
  for (const file of [
    "package.json",
    "bun.lock",
    "relkit.config.ts",
    "src/platform/env.ts",
    ...required,
    ".gitignore",
  ])
    await access(join(root, file));
  await runCommand(
    ["install", "--frozen-lockfile", "--registry", registry],
    root,
    registry,
    cacheDir,
  );
  for (const script of ["check", "typecheck"]) await runCommand(["run", script], root);
  if (!taskProject || process.env.RELKIT_TEST_DOCKER === "1")
    for (let run = 0; run < (exercise ? 2 : 1); run++)
      await import("./pack-and-smoke-create-relkit-dev.js").then(({ devSmoke }) =>
        devSmoke(root, exercise),
      );
}
