/**
 * Newcomer walkthrough with the package runners a newcomer types: `bunx create-relkit` and
 * `npx create-relkit`, each resolving the packed candidate from a local registry, then one route
 * added and `<manager> run dev` answering it. Each runner gets fresh caches. The result records the
 * slowest runner as the time to a first route and lists every runner's steps.
 *
 * The registry directory is the one `scripts/node-creation-smoke.ts --out <dir>` prepares (packed
 * tarballs and `index.json`); packing it is not part of the time.
 *
 *   bun scripts/walkthrough/create-with-runner.ts --prepared <dir> [--runners bunx,npx]
 *     [--template minimal] [--output <file>]
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { startPreparedRegistry, type PreparedRegistryIndex } from "../node-creation-registry.js";
import { option, Stopwatch, writeWalkthroughResult } from "./support.js";

type Runner = "bunx" | "npx";

/** The function a newcomer adds beside `hello`. */
const FUNCTION = `/** Says goodbye to a named visitor. */
import { defineFunction } from "relkit/functions";
import { z } from "zod";

export default defineFunction({
  id: "hello.farewell",
  input: z.object({ name: z.string().min(1).default("world") }),
  output: z.object({ message: z.string() }),
  handler: async ({ name }) => ({ message: \`Goodbye, \${name}!\` }),
});
`;

/** The route that exposes it. */
const ROUTE = `/** Maps GET /farewell to the farewell function. */
import { defineRoute } from "relkit/routes";
import hello from "@app/services/hello/service.js";

export const GET = defineRoute({ target: hello.farewell });
`;

/** @returns A loopback port no listener holds right now. */
function freePort(): number {
  const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = probe.port ?? 0;
  void probe.stop(true);
  return port;
}

/**
 * Runs one command to completion with inherited output.
 * @param command - Executable and arguments. @param cwd - Directory. @param env - Environment.
 * @returns Completion; a non-zero exit throws.
 */
function run(command: readonly string[], cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((done, fail) => {
    const child = spawn(command[0]!, command.slice(1), { cwd, env, stdio: "inherit" });
    child.once("error", fail);
    child.once("exit", (code) =>
      code === 0 ? done() : fail(new Error(`${command.join(" ")} exited with ${code}`)),
    );
  });
}

/** Adds the farewell function and route. @param project - Project root. */
async function addRoute(project: string): Promise<void> {
  const service = join(project, "src/services/hello/service.ts");
  const source = await readFile(service, "utf8");
  await writeFile(
    service,
    source
      .replace(
        'import hello from "@app/services/hello/functions/hello.function.js";',
        'import hello from "@app/services/hello/functions/hello.function.js";\nimport farewell from "@app/services/hello/functions/farewell.function.js";',
      )
      .replace("{ hello }", "{ hello, farewell }"),
  );
  await writeFile(join(project, "src/services/hello/functions/farewell.function.ts"), FUNCTION);
  await mkdir(join(project, "src/routes/farewell"), { recursive: true });
  await writeFile(join(project, "src/routes/farewell/route.ts"), ROUTE);
}

/**
 * Starts `<manager> run dev` and waits for the new route.
 * @param project - Project root. @param manager - `bun` or `npm`. @param env - Environment.
 * @returns Completion once `GET /farewell?name=Ada` returns the greeting.
 */
async function waitForRoute(project: string, manager: string, env: NodeJS.ProcessEnv) {
  const port = freePort();
  const dev: ChildProcess = spawn(manager, ["run", "dev"], {
    cwd: project,
    env: { ...env, PORT: String(port) },
    stdio: "inherit",
    detached: true,
  });
  try {
    const deadline = Date.now() + 240_000;
    while (Date.now() < deadline) {
      if (dev.exitCode !== null) throw new Error(`${manager} run dev exited with ${dev.exitCode}`);
      const body = await fetch(`http://127.0.0.1:${port}/farewell?name=Ada`).then(
        async (response) => (response.status === 200 ? response.text() : undefined),
        () => undefined,
      );
      if (body?.includes("Goodbye, Ada!") === true) return;
      await Bun.sleep(250);
    }
    throw new Error("The new route did not answer within 240 seconds.");
  } finally {
    if (dev.exitCode === null && dev.pid !== undefined) {
      const exited = new Promise((done) => dev.once("exit", done));
      process.kill(-dev.pid, "SIGINT");
      const timer = setTimeout(() => process.kill(-dev.pid!, "SIGKILL"), 15_000);
      await exited;
      clearTimeout(timer);
    }
  }
}

/**
 * Creates with one runner and times it.
 * @param runner - `bunx` or `npx`. @param version - Candidate version. @param template - Template.
 * @param registry - Registry URL. @param clock - Stopwatch for this runner.
 */
async function walk(
  runner: Runner,
  version: string,
  template: string,
  registry: string,
  clock: Stopwatch,
): Promise<void> {
  const temporary = await mkdtemp(join(tmpdir(), `relkit-walkthrough-${runner}-`));
  const path = (process.env.PATH ?? "")
    .split(delimiter)
    .filter((entry) => runner === "bunx" || !entry.includes(".bun"));
  // bunx reuses `$TMPDIR/bunx-<uid>-<package>@<version>`; a fresh TMPDIR forces the registry.
  await mkdir(join(temporary, "tmp"));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: path.join(delimiter),
    TMPDIR: join(temporary, "tmp"),
    CI: "1",
    BUN_CONFIG_REGISTRY: registry,
    BUN_INSTALL_CACHE_DIR: join(temporary, "bun-cache"),
    npm_config_registry: registry,
    npm_config_cache: join(temporary, "npm-cache"),
    npm_config_update_notifier: "false",
  };
  delete env.npm_config_user_agent;
  try {
    const create = [`create-relkit@${version}`, "app", "--template", template, "--no-git"];
    await run(runner === "npx" ? ["npx", "--yes", ...create] : ["bunx", ...create], temporary, env);
    const project = join(temporary, "app");
    const lockfile = runner === "npx" ? "package-lock.json" : "bun.lock";
    if (!existsSync(join(project, lockfile)))
      throw new Error(`${runner} create-relkit did not install with its manager (no ${lockfile}).`);
    clock.lap(`${runner}:create`);
    await addRoute(project);
    clock.lap(`${runner}:route-added`);
    await waitForRoute(project, runner === "npx" ? "npm" : "bun", env);
    clock.lap(`${runner}:route-answers`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const prepared = option("prepared");
  if (prepared === undefined)
    throw new Error("--prepared <node-creation-smoke output> is required");
  const runners = (option("runners") ?? "bunx,npx").split(",") as Runner[];
  const template = option("template") ?? "minimal";
  const index = JSON.parse(
    await readFile(join(resolve(prepared), "index.json"), "utf8"),
  ) as PreparedRegistryIndex;
  const version = index.packages.find((entry) => entry.manifest.name === "create-relkit")?.manifest
    .version;
  if (version === undefined) throw new Error("The prepared registry has no create-relkit.");
  const registry = await startPreparedRegistry(resolve(prepared));
  const timings: { runner: Runner; clock: Stopwatch }[] = [];
  let failure: string | undefined;
  try {
    for (const runner of runners) {
      const clock = new Stopwatch();
      timings.push({ runner, clock });
      await walk(runner, version, template, registry.url, clock);
    }
  } catch (error) {
    const last = timings.at(-1);
    failure = `${last?.runner} stopped after ${last?.clock.steps.at(-1)?.name ?? "start"}: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    await registry.close();
  }
  const totals = timings.map(({ runner, clock }) => ({
    runner,
    seconds: clock.steps.at(-1)?.seconds ?? 0,
  }));
  const result = await writeWalkthroughResult(option("output"), {
    kind: "create-to-first-route",
    outcome: failure === undefined ? "passed" : "failed",
    seconds: failure === undefined ? Math.max(...totals.map((item) => item.seconds)) : null,
    steps: timings.flatMap(({ clock }) => clock.steps),
    note:
      failure ??
      `${totals.map(({ runner, seconds }) => `${runner} create-relkit ${seconds} s`).join(", ")} (the slower is the figure): the ${template} template from the packed candidate on a local registry with fresh caches, one route added, run dev answering it; packing is excluded.`,
  });
  console.log(JSON.stringify(result));
  if (failure !== undefined) process.exitCode = 1;
}

await main();
