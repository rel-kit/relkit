/**
 * Keeps Bun projects on Bun. The executables start with `#!/usr/bin/env node`, so `bun run dev`
 * (which honours the shebang) starts the CLI on Node when Node is installed. When a Bun command
 * invoked the CLI (`npm_config_user_agent` starts with `bun/`) and the CLI runs on Node, it runs
 * itself again on Bun and exits with Bun's status.
 */
import { spawn } from "node:child_process";
import { constants } from "node:os";

/**
 * Tells whether this Node process should hand the invocation to Bun.
 * @param environment - Process environment.
 * @returns Whether a Bun command invoked this Node process.
 */
export function shouldHandOffToBun(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return (
    typeof process.versions.bun !== "string" &&
    (environment["npm_config_user_agent"] ?? "").startsWith("bun/") &&
    environment["RELKIT_BUN_HANDOFF"] !== "0"
  );
}

/**
 * Runs an entry point on Bun with the same arguments, forwarding interruption.
 * @param entry - Absolute entry point.
 * @param args - Original arguments.
 * @returns Bun's exit status, or undefined when Bun is not installed (the caller runs on Node).
 */
export function handOffToBun(entry: string, args: readonly string[]): Promise<number | undefined> {
  return new Promise((resolve) => {
    const child = spawn("bun", [entry, ...args], {
      stdio: "inherit",
      env: { ...process.env, RELKIT_BUN_HANDOFF: "0" },
    });
    const interrupt = () => child.kill("SIGINT");
    const terminate = () => child.kill("SIGTERM");
    const cleanup = () => {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", terminate);
    };
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", terminate);
    child.once("error", () => {
      cleanup();
      resolve(undefined);
    });
    child.once("close", (status, signal) => {
      cleanup();
      resolve(status ?? (signal ? 128 + constants.signals[signal] : 1));
    });
  });
}
