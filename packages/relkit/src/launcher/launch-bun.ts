/**
 * Owns one CLI child until exit, forwarding terminal cancellation before releasing listeners.
 * The child runs on Bun when the launcher runs on Bun or a Bun command invoked it
 * (`npm_config_user_agent` starts with `bun/`), and otherwise on the Node running the launcher.
 */

import { spawn } from "node:child_process";
import { constants } from "node:os";

/** A package runner subcommand: fetch and run a published package. */
export interface PackageRunner {
  /** Exact package specifier, such as `create-relkit@0.9.0`. */
  readonly runPackage: string;
}

/**
 * Selects the executable and leading arguments for an entry point or package runner.
 * @param entry - Selected physical executable module, or a package to fetch and run.
 * @param environment - Process environment carrying the invoking package manager.
 * @returns Executable, leading arguments and whether it is Bun.
 */
export function launchCommand(
  entry: string | PackageRunner,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): { readonly executable: string; readonly args: readonly string[]; readonly bun: boolean } {
  const agent = environment["npm_config_user_agent"] ?? "";
  const bun = typeof process.versions.bun === "string" || agent.startsWith("bun/");
  const executable = typeof process.versions.bun === "string" ? process.execPath : "bun";
  if (typeof entry === "string")
    return bun
      ? { executable, args: [entry], bun }
      : { executable: process.execPath, args: [entry], bun };
  if (bun) return { executable, args: ["x", entry.runPackage], bun };
  if (agent.startsWith("pnpm/"))
    return { executable: "pnpm", args: ["dlx", entry.runPackage], bun: false };
  return { executable: "npx", args: ["--yes", entry.runPackage], bun: false };
}

/** Executes a literal entrypoint, or fetches and runs a package, and joins its completion.
 * @param entry - Selected physical executable module, or a package runner request.
 * @param args - Original command arguments.
 * @param cwd - Explicit child working directory.
 * @returns The native exit or signal status after cancellation settles.
 */
export function launchBun(
  entry: string | PackageRunner,
  args: readonly string[],
  cwd = process.cwd(),
): Promise<number> {
  const command = launchCommand(entry);
  return new Promise((resolve, reject) => {
    const child = spawn(command.executable, [...command.args, ...args], { cwd, stdio: "inherit" });
    const interrupt = () => child.kill("SIGINT");
    const terminate = () => child.kill("SIGTERM");
    const cleanup = () => {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", terminate);
    };
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", terminate);
    child.once("error", (cause) => {
      cleanup();
      reject(
        "code" in cause && cause.code === "ENOENT"
          ? new Error(
              command.bun
                ? "RELKIT_BUN_REQUIRED: Install Bun >=1.3.10 and make bun available on PATH."
                : `${command.executable} is not available on PATH.`,
              { cause },
            )
          : cause,
      );
    });
    child.once("close", (status, signal) => {
      cleanup();
      resolve(status ?? (signal ? 128 + constants.signals[signal] : 1));
    });
  });
}
