/** Owns disposable native migration apps; links are local-test evidence, never packed acceptance. */
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach } from "bun:test";
import cliManifest from "../../package.json";
import { runCli } from "../../src/main.js";

const repository = resolve(import.meta.dir, "../../../..");
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

export async function app() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "relkit db test ")));
  roots.push(root);
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      dependencies: {
        "drizzle-orm": cliManifest.relkit.buildCatalog.dependencies["drizzle-orm"],
        "drizzle-kit": cliManifest.relkit.buildCatalog.dependencies["drizzle-kit"],
      },
    }),
  );
  await writeFile(join(root, "relkit.config.ts"), "export default {};\n");
  await mkdir(join(root, "node_modules"));
  await symlink(
    join(repository, "node_modules/drizzle-orm"),
    join(root, "node_modules/drizzle-orm"),
  );
  await write(
    root,
    "history/20260101000000_first/migration.sql",
    "CREATE TABLE entries (id INTEGER PRIMARY KEY, value TEXT NOT NULL);\n",
  );
  await config(root);
  return root;
}

export async function write(root: string, path: string, text: string) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}

export async function config(
  root: string,
  source = '{dialect:"sqlite",out:"./history",dbCredentials:{url:"./data/selected.sqlite"}}',
  path = "drizzle.config.ts",
) {
  await write(root, path, `export default ${source};\n`);
}

export async function migrate(root: string, args: string[] = []) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli(["--json", "db", "migrate", ...args], {
    cwd: root,
    installSignalHandlers: false,
    io: { stdout: (line) => stdout.push(line), stderr: (line) => stderr.push(line) },
  });
  return { code, stdout, stderr, result: JSON.parse(stdout[0] ?? "null") };
}

/** Built CLI executable; tests that run the CLI on Node need `turbo run build --filter=@relkit/cli`. */
export const builtCli = join(repository, "packages/cli/dist/bin.js");

/**
 * Runs the built CLI on Node from the app directory, with the Bun hand-off disabled.
 * @param root - Application root and working directory.
 * @param args - CLI arguments after the executable.
 * @param environment - Values set (or, when undefined, removed) on top of the test's environment.
 * @returns Exit status and captured output.
 */
export async function nodeCli(
  root: string,
  args: readonly string[],
  environment: Record<string, string | undefined> = {},
) {
  const env: Record<string, string | undefined> = {
    ...process.env,
    RELKIT_BUN_HANDOFF: "0",
    npm_config_user_agent: undefined,
    // `bun test` sets NODE_ENV=test; a user's shell normally leaves it unset.
    NODE_ENV: undefined,
    ...environment,
  };
  const child = Bun.spawn(["node", builtCli, ...args], {
    cwd: root,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, stdout, stderr };
}

/** Runs the actual executable from the app cwd so Bun's dotenv behavior is observable. */
export async function nativeMigrate(
  root: string,
  environment: Record<string, string | undefined> = {},
) {
  const child = Bun.spawn(
    [process.execPath, join(repository, "packages/cli/src/bin.ts"), "--json", "db", "migrate"],
    {
      cwd: root,
      env: { ...process.env, ...environment },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, stdout, stderr, result: JSON.parse(stdout) };
}
