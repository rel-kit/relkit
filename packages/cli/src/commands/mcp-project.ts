/**
 * Runs `relkit check` and `relkit add` for an MCP client by starting this CLI as a child
 * process with `--json`. The child has no terminal, so it never prompts; `add` keeps its own
 * transaction, which restores every file it touched when a step fails.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { McpCommandResult, McpProjectCommands } from "./mcp.types.js";

const COMMAND_TIMEOUT_MS = 300_000;

/**
 * Finds this CLI's entry file next to the running module.
 * @returns The built `bin.js`, or the source `bin.ts` when running from source.
 */
function cliEntry(): string {
  const built = fileURLToPath(new URL("../bin.js", import.meta.url));
  return existsSync(built) ? built : fileURLToPath(new URL("../bin.ts", import.meta.url));
}

/**
 * Runs one CLI invocation and collects its output.
 * @param root - Application root, passed as `--project-root`.
 * @param args - Command and its arguments.
 * @returns The exit status, parsed JSON output and standard error.
 */
async function runCli(root: string, args: readonly string[]): Promise<McpCommandResult> {
  const child = Bun.spawn(
    [process.execPath, cliEntry(), ...args, "--json", "--project-root", root],
    {
      cwd: root,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, CI: "1", NO_COLOR: "1" },
    },
  );
  const timer = setTimeout(() => child.kill(), COMMAND_TIMEOUT_MS);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { exitCode, output: parseOutput(stdout), stderr: stderr.slice(-8192) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reads the JSON a `--json` command prints, keeping text when it printed none.
 * @param stdout - Captured standard output.
 * @returns Parsed JSON values (one per line), a single value, or the trimmed text.
 */
export function parseOutput(stdout: string): unknown {
  const values = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as unknown];
      } catch {
        return [];
      }
    });
  if (values.length === 1) return values[0];
  return values.length > 1 ? values : stdout.trim().slice(-8192);
}

/** Live commands backed by this CLI. */
export const mcpProjectCommands: McpProjectCommands = {
  check: (root) => runCli(root, ["check"]),
  add: (root, args) => runCli(root, ["add", ...args]),
};
