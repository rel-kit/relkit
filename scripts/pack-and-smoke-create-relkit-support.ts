import { access, readFile, readdir, stat } from "node:fs/promises";
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
    if (["node_modules", ".git"].includes(entry.name)) continue;
    const path = join(current, entry.name);
    if (entry.isDirectory()) Object.assign(result, await snapshotProject(root, path));
    else if (entry.isFile()) {
      const name = relative(root, path).replaceAll("\\", "/");
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
async function sourceScan(root: string): Promise<void> {
  const bad =
    "effect hono next @pulumi/ @aws-sdk/ @relkit/compiler @relkit/engine @relkit/graph " +
    "@relkit/runtime-effect @relkit/runtime-hono @relkit/supervisor";
  const pattern = new RegExp(`(?:from|import)\\s*["'](?:${bad.split(" ").join("|")})`);
  const scan = async (directory: string): Promise<string[]> => {
    const result: string[] = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (["node_modules", ".git", ".relkit"].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) result.push(...(await scan(path)));
      else if (
        entry.isFile() &&
        /\.(?:ts|tsx|js|jsx)$/.test(entry.name) &&
        pattern.test(await readFile(path, "utf8"))
      )
        result.push(relative(root, path));
    }
    return result;
  };
  const violations = await scan(root);
  if (violations.length > 0)
    throw new Error(`Generated source scan failed:\n${violations.join("\n")}`);
}
async function freePort(): Promise<number> {
  const server = Bun.serve({ port: 0, fetch: () => new Response() });
  const port = server.port;
  await server.stop(true);
  if (port === undefined) throw new Error("Could not allocate a dynamic port.");
  return port;
}
async function waitFor(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch {}
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  throw new Error("Timed out waiting for the generated development server.");
}
async function devSmoke(root: string): Promise<void> {
  const port = await freePort();
  const inspector = await freePort();
  const child = Bun.spawn(
    [
      process.execPath,
      "run",
      "dev",
      "--",
      "--project-root",
      root,
      "--port",
      String(port),
      "--inspector-port",
      String(inspector),
    ],
    {
      cwd: root,
      env: { ...process.env, PORT: String(port) },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const output = Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  let failure: unknown;
  try {
    await waitFor(async () => {
      if (child.exitCode !== null)
        throw new Error(`Development process exited with ${child.exitCode}.`);
      const response = await fetch(`http://127.0.0.1:${port}/hello?name=RelKit`);
      if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
      return (await fetch(`http://127.0.0.1:${inspector}`)).ok;
    });
    const route = (await (await fetch(`http://127.0.0.1:${port}/hello?name=RelKit`)).json()) as {
      message?: string;
    };
    if (route.message !== "Hello, RelKit!")
      throw new Error("Example route returned an unexpected greeting.");
    const graph = await fetch(`http://127.0.0.1:${port}/_relkit/v1/graph`);
    if (!graph.ok || !(await graph.text()).includes('"graphHash"'))
      throw new Error("Inspector graph API failed.");
    const inspectorGraph = await fetch(
      `http://127.0.0.1:${inspector}/_relkit/backend/_relkit/v1/graph`,
    );
    if (!inspectorGraph.ok || !(await inspectorGraph.text()).includes('"graphHash"'))
      throw new Error("Packaged inspector proxy failed.");
    const openapi = await fetch(`http://127.0.0.1:${port}/_relkit/v1/openapi.json`);
    if (!openapi.ok || !(await openapi.text()).includes('"openapi":"3.1.0"'))
      throw new Error("OpenAPI endpoint failed.");
    const scalar = await fetch(`http://127.0.0.1:${port}/_relkit/v1/api-reference`);
    if (!scalar.ok || !(await scalar.text()).toLowerCase().includes("scalar"))
      throw new Error("Scalar API reference failed.");
  } catch (error) {
    failure = error;
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    await Promise.race([child.exited, new Promise((resolve) => setTimeout(resolve, 2_000))]);
    if (child.exitCode === null) child.kill("SIGKILL");
    await child.exited;
  }
  const [stdout, stderr] = await output;
  if (failure !== undefined) throw new Error(`${failure}\n${stdout}${stderr}`);
  if (child.exitCode !== 0 && child.exitCode !== 143)
    throw new Error(`Development process exited with ${child.exitCode}.\n${stdout}${stderr}`);
  await assertPortReleased(port);
  await assertPortReleased(inspector);
}
async function assertPortReleased(port: number): Promise<void> {
  const probe = Bun.serve({ hostname: "127.0.0.1", port, fetch: () => new Response() });
  await probe.stop(true);
}
export async function verifyProject(
  root: string,
  registry: string,
  cacheDir: string,
): Promise<void> {
  for (const file of [
    "package.json",
    "bun.lock",
    "relkit.config.ts",
    "src/platform/env.ts",
    "src/hello/functions/hello.function.ts",
    "src/hello/service.ts",
    "src/routes/hello/route.ts",
    "tests/integration/hello.route.test.ts",
    ".gitignore",
  ])
    await access(join(root, file));
  await runCommand(
    ["install", "--frozen-lockfile", "--registry", registry],
    root,
    registry,
    cacheDir,
  );
  for (const script of ["check", "typecheck", "test", "build"])
    await runCommand(["run", script], root);
  await devSmoke(root);
  await sourceScan(root);
}
