/**
 * Runtime HTTP suite: packs this checkout, creates the `api` template from a local registry,
 * builds it with `relkit build --runtime <runtime>`, starts the production server on the given
 * executable and runs the template's own HTTP tests against it through `RELKIT_TEST_SERVER_URL`.
 * The pull-request runtime matrix runs it once per Tier 1 runtime; the nightly matrix also runs
 * it on Workers, where the bundle is served by workerd through a pinned `wrangler dev`.
 *
 *   bun scripts/runtime-http-suite.ts --runtime node [--executable /path/to/node]
 *     [--artifacts <packed release directory>] [--project <installed api project>]
 *   bun scripts/runtime-http-suite.ts --runtime workers
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Effect } from "effect";
import { preparePackedFixture } from "./dev-readiness/packed-fixture.js";

const root = resolve(import.meta.dir, "..");

/** Wrangler release that serves the Workers bundle locally (workerd); the generator pins the same. */
export const RUNTIME_SUITE_WRANGLER = "wrangler@4.151.3";

/** Runtimes the suite runs on. */
type SuiteRuntime = "bun" | "node" | "workers";

/** Parsed command line. */
interface SuiteOptions {
  readonly runtime: SuiteRuntime;
  readonly executable: string;
  readonly artifacts: string | undefined;
  readonly project: string | undefined;
}

/**
 * Reads one `--name value` option.
 * @param name - Option name without dashes.
 * @returns The value, or undefined when absent.
 */
function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`--${name} needs a value`);
  return value;
}

/** @returns Validated options. */
function options(): SuiteOptions {
  const runtime = option("runtime");
  if (runtime !== "bun" && runtime !== "node" && runtime !== "workers")
    throw new Error("--runtime must be bun, node or workers");
  const artifacts = option("artifacts");
  const project = option("project");
  return {
    runtime,
    executable: option("executable") ?? runtime,
    artifacts: artifacts === undefined ? undefined : resolve(artifacts),
    project: project === undefined ? undefined : resolve(project),
  };
}

/**
 * Runs one command to completion with inherited output.
 * @param command - Executable and arguments.
 * @param cwd - Working directory.
 * @param env - Extra environment variables.
 */
async function run(command: readonly string[], cwd: string, env: Record<string, string> = {}) {
  const child = Bun.spawn([...command], {
    cwd,
    env: { ...process.env, ...env },
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await child.exited;
  if (code !== 0) throw new Error(`${command.join(" ")} failed in ${cwd} (exit ${code})`);
}

/** @returns A port no listener holds right now. */
function freePort(): number {
  const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = probe.port ?? 0;
  void probe.stop(true);
  return port;
}

/**
 * Starts the production server and waits until it reports ready.
 * @param suite - Runtime and executable.
 * @param project - Built project root.
 * @param port - Listener port.
 * @returns The running child.
 */
async function startServer(suite: SuiteOptions, project: string, port: number) {
  const entry = join(project, ".relkit/build/server/index.js");
  const command =
    suite.runtime === "workers"
      ? await workersCommand(project, port)
      : suite.runtime === "node"
        ? [suite.executable, entry]
        : [suite.executable, "run", "--no-env-file", entry];
  const child = Bun.spawn(command, {
    cwd: project,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      WRANGLER_SEND_METRICS: "false",
    },
    stdout: "inherit",
    stderr: "inherit",
  });
  // The first Workers run may download wrangler and workerd before serving.
  const budgetSeconds = suite.runtime === "workers" ? 180 : 60;
  const deadline = Date.now() + budgetSeconds * 1000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(
        `The ${suite.runtime} server exited with ${child.exitCode} before it was ready.`,
      );
    const ready = await fetch(`http://127.0.0.1:${port}/_relkit/v1/health/ready`).then(
      (response) => response.status === 200,
      () => false,
    );
    if (ready) return child;
    await Bun.sleep(250);
  }
  child.kill();
  throw new Error(`The ${suite.runtime} server was not ready within ${budgetSeconds} seconds.`);
}

/**
 * Writes the minimal wrangler configuration for the built Workers bundle and returns the command
 * that serves it locally in workerd.
 * @param project - Built project root.
 * @param port - Listener port.
 * @returns `bunx wrangler dev` with the configuration and address.
 */
async function workersCommand(project: string, port: number): Promise<string[]> {
  const directory = join(project, ".relkit/runtime-http-suite");
  await mkdir(directory, { recursive: true });
  const config = join(directory, "wrangler.jsonc");
  await writeFile(
    config,
    `${JSON.stringify(
      {
        name: "relkit-runtime-http-suite",
        main: "../build/server/index.js",
        compatibility_date: "2026-10-01",
        compatibility_flags: ["nodejs_compat"],
        assets: { directory: "../build/public" },
      },
      null,
      2,
    )}\n`,
  );
  return [
    process.execPath,
    "x",
    RUNTIME_SUITE_WRANGLER,
    "dev",
    "--config",
    config,
    "--ip",
    "127.0.0.1",
    "--port",
    String(port),
  ];
}

/**
 * Reads the version the executable reports.
 * @param executable - Runtime executable.
 * @returns Its `--version` output.
 */
async function runtimeVersion(executable: string): Promise<string> {
  const child = Bun.spawn([executable, "--version"], { stdout: "pipe", stderr: "ignore" });
  return (await new Response(child.stdout).text()).trim();
}

async function main(): Promise<void> {
  const suite = options();
  let temporary: string | undefined;
  let project = suite.project;
  if (project === undefined) {
    const fixture = await Effect.runPromise(
      Effect.scoped(preparePackedFixture(root, "examples", suite.artifacts, "api")),
    );
    temporary = fixture.temporary;
    project = fixture.projectRoot;
  }
  await run(
    [process.execPath, "x", "--no-install", "relkit", "build", "--runtime", suite.runtime],
    project,
  );
  const port = freePort();
  const server = await startServer(suite, project, port);
  try {
    await run([process.execPath, "test", "tests/integration"], project, {
      RELKIT_TEST_SERVER_URL: `http://127.0.0.1:${port}`,
    });
  } finally {
    server.kill("SIGTERM");
    await server.exited;
  }
  const version =
    suite.runtime === "workers"
      ? `workerd (${RUNTIME_SUITE_WRANGLER})`
      : await runtimeVersion(suite.executable);
  console.log(
    `api template HTTP suite passed against the production server on ${suite.runtime} ${version}`,
  );
  if (temporary !== undefined) await rm(temporary, { recursive: true, force: true });
}

if (import.meta.main) await main();
