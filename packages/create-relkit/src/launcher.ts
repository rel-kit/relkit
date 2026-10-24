/** Owns one Bun child until exit, forwarding terminal cancellation before releasing listeners. */

import { spawn } from "node:child_process";
import { constants } from "node:os";

/** Executes a literal entrypoint under Bun and joins its actual completion.
 * @param entry - Selected physical executable module.
 * @param args - Original command arguments.
 * @param cwd - Explicit child working directory.
 * @returns The native exit or signal status after cancellation settles.
 */
export function launchBun(
  entry: string,
  args: readonly string[],
  cwd = process.cwd(),
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.versions.bun ? process.execPath : "bun", [entry, ...args], {
      cwd,
      stdio: "inherit",
    });
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
          ? new Error("RELKIT_BUN_REQUIRED: Install Bun >=1.3.10 and make bun available on PATH.", {
              cause,
            })
          : cause,
      );
    });
    child.once("close", (status, signal) => {
      cleanup();
      resolve(status ?? (signal ? 128 + constants.signals[signal] : 1));
    });
  });
}
