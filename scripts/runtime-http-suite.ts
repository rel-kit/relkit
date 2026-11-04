/**
 * Runtime HTTP suite: packs this checkout, creates the `api` template from a local registry,
 * builds it with `relkit build --runtime <runtime>`, starts the production server on the given
 * executable and runs the template's own HTTP tests against it through `RELKIT_TEST_SERVER_URL`.
 * The pull-request runtime matrix runs it once per Tier 1 runtime.
 *
 *   bun scripts/runtime-http-suite.ts --runtime node [--executable /path/to/node]
 *     [--artifacts <packed release directory>] [--project <installed api project>]
 */
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Effect } from "effect";
import { preparePackedFixture } from "./dev-readiness/packed-fixture.js";

const root = resolve(import.meta.dir, "..");

/** Parsed command line. */
interface SuiteOptions {
  readonly runtime: "bun" | "node";
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
  if (runtime !== "bun" && runtime !== "node") throw new Error("--runtime must be bun or node");
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
    suite.runtime === "node"
      ? [suite.executable, entry]
      : [suite.executable, "run", "--no-env-file", entry];
  const child = Bun.spawn(command, {
    cwd: project,
    env: { ...process.env, NODE_ENV: "production", PORT: String(port) },
    stdout: "inherit",
    stderr: "inherit",
  });
  const deadline = Date.now() + 60_000;
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
  throw new Error(`The ${suite.runtime} server was not ready within 60 seconds.`);
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
  const version = await runtimeVersion(suite.executable);
  console.log(
    `api template HTTP suite passed against the production server on ${suite.runtime} ${version}`,
  );
  if (temporary !== undefined) await rm(temporary, { recursive: true, force: true });
}

if (import.meta.main) await main();
