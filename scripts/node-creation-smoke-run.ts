/**
 * Node creation smoke, run with Node and no Bun: serves the prepared candidate from a local
 * registry, creates a project with `npx create-relkit` (npm) or `pnpm dlx create-relkit` (pnpm),
 * starts `<manager> run dev` and waits until the example route answers. The prepare step of
 * `node-creation-smoke.ts` bundles this file to `smoke.mjs` next to the registry it serves.
 *
 *   node smoke.mjs --package-manager npm|pnpm [--template minimal] [--require-no-bun] [--keep]
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startPreparedRegistry, type PreparedRegistryIndex } from "./node-creation-registry.js";

/** Reads one `--name value` option. @param name - Option name. @returns Its value. */
function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
}

/**
 * Runs one command to completion with inherited output.
 * @param command - Executable and arguments.
 * @param cwd - Working directory.
 * @param env - Complete environment.
 * @returns Completion; a non-zero exit throws.
 */
function run(command: readonly string[], cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0]!, command.slice(1), { cwd, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command.join(" ")} exited with ${code}`)),
    );
  });
}

/** @returns A loopback port no listener holds right now. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

/**
 * Stops a detached process group: SIGINT, then SIGKILL after a grace period.
 * @param child - Group leader.
 * @returns Completion once the leader exited.
 */
async function stopGroup(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.pid === undefined) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  process.kill(-child.pid, "SIGINT");
  const timer = setTimeout(() => process.kill(-child.pid!, "SIGKILL"), 15_000);
  await exited;
  clearTimeout(timer);
}

/**
 * Waits until the development server answers the example route.
 * @param port - Development port.
 * @param child - Running `run dev` process.
 * @returns The response text.
 */
async function waitForRoute(port: number, child: ChildProcess): Promise<string> {
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`run dev exited with ${child.exitCode}.`);
    const text = await fetch(`http://127.0.0.1:${port}/hello?name=RelKit`).then(
      (response) => (response.status === 200 ? response.text() : undefined),
      () => undefined,
    );
    if (text !== undefined) return text;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("The development server did not answer within 240 seconds.");
}

async function main(): Promise<void> {
  const manager = option("package-manager");
  if (manager !== "npm" && manager !== "pnpm") throw new Error("--package-manager npm|pnpm");
  const template = option("template") ?? "minimal";
  if (
    process.argv.includes("--require-no-bun") &&
    spawnSync("bun", ["--version"]).error === undefined
  )
    throw new Error("bun is on PATH; this smoke must run without Bun.");
  const directory = dirname(fileURLToPath(import.meta.url));
  const index = JSON.parse(
    await readFile(join(directory, "index.json"), "utf8"),
  ) as PreparedRegistryIndex;
  const version = index.packages.find((entry) => entry.manifest.name === "create-relkit")?.manifest
    .version;
  if (version === undefined) throw new Error("The prepared registry has no create-relkit.");
  const registry = await startPreparedRegistry(directory);
  const temporary = await mkdtemp(join(tmpdir(), `relkit-node-${manager}-`));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CI: "1",
    npm_config_registry: registry.url,
    npm_config_cache: join(temporary, "npm-cache"),
    // Fresh caches: the candidate shares its version with the published release.
    npm_config_store_dir: join(temporary, "pnpm-store"),
    npm_config_cache_dir: join(temporary, "pnpm-cache"),
    npm_config_update_notifier: "false",
  };
  // pnpm 11 reads `pnpm_config_*`; earlier releases read `npm_config_*`.
  for (const name of ["registry", "store_dir", "cache_dir"])
    env[`pnpm_config_${name}`] = env[`npm_config_${name}`];
  delete env["npm_config_user_agent"];
  let dev: ChildProcess | undefined;
  try {
    const create = [`create-relkit@${version}`, "smoke-app", "--template", template, "--no-git"];
    await run(
      manager === "npm" ? ["npx", "--yes", ...create] : ["pnpm", "dlx", ...create],
      temporary,
      env,
    );
    const project = join(temporary, "smoke-app");
    const lockfile = manager === "npm" ? "package-lock.json" : "pnpm-lock.yaml";
    if (!existsSync(join(project, lockfile)))
      throw new Error(`The project was not installed with ${manager} (no ${lockfile}).`);
    const port = await freePort();
    dev = spawn(manager, ["run", "dev"], {
      cwd: project,
      env: { ...env, PORT: String(port) },
      stdio: "inherit",
      detached: true,
    });
    const body = await waitForRoute(port, dev);
    const runtime = `Node ${process.version}`;
    console.log(`${manager} run dev on ${runtime} answered GET /hello: ${body.slice(0, 200)}`);
  } finally {
    if (dev !== undefined) await stopGroup(dev);
    await registry.close();
    if (!process.argv.includes("--keep")) await rm(temporary, { recursive: true, force: true });
    else console.log(`kept ${temporary}`);
  }
}

await main();
