/** Links a generated database project's Node driver and runs the CLI or a script on one runtime. */
import { mkdir, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";

const repository = resolve(import.meta.dir, "../..");
const hoisted = join(repository, "node_modules/.bun/node_modules");

/**
 * Links the driver package the scaffold added for a dialect, as an install would.
 * @param root - Generated project.
 * @param dialect - Database dialect; SQLite needs no package.
 * @returns Completion after the link exists.
 */
export async function linkDriver(root: string, dialect: "sqlite" | "postgresql" | "mysql") {
  const name = { sqlite: undefined, postgresql: "pg", mysql: "mysql2" }[dialect];
  if (name === undefined) return;
  await mkdir(join(root, "node_modules"), { recursive: true });
  await symlink(join(hoisted, name), join(root, "node_modules", name));
}

/**
 * Links the installed drizzle-kit, as an install of the scaffold's development dependency would.
 * @param root - Generated project.
 * @returns Completion after the link exists.
 */
export async function linkDrizzleKit(root: string) {
  await symlink(join(hoisted, "drizzle-kit"), join(root, "node_modules/drizzle-kit"));
}

/**
 * Runs the CLI, or a TypeScript script, on Node or Bun from the project directory. Node runs the
 * built CLI with the Bun hand-off disabled and no package manager user agent; scripts on Node use
 * the CLI's TypeScript hooks.
 * @param runtime - `node` or `bun`.
 * @param root - Working directory.
 * @param args - CLI arguments, or the script path for `script` mode.
 * @param environment - Values added to the environment.
 * @param mode - `cli` or `script`.
 * @returns Exit status and output.
 */
export async function runOn(
  runtime: "node" | "bun",
  root: string,
  args: readonly string[],
  environment: Record<string, string> = {},
  mode: "cli" | "script" = "cli",
) {
  const hooks = join(repository, "packages/cli/dist/runtime/node/typescript-register.js");
  const command =
    runtime === "bun"
      ? mode === "cli"
        ? [process.execPath, join(repository, "packages/cli/src/bin.ts")]
        : [process.execPath, "--no-env-file"]
      : mode === "cli"
        ? ["node", join(repository, "packages/cli/dist/bin.js")]
        : ["node", "--disable-warning=ExperimentalWarning", "--import", hooks];
  const env: Record<string, string | undefined> = {
    ...process.env,
    RELKIT_BUN_HANDOFF: "0",
    npm_config_user_agent: undefined,
    NODE_ENV: undefined,
    ...environment,
  };
  const child = Bun.spawn([...command, ...args], {
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
