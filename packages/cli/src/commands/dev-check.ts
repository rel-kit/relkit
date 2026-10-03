import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { CheckResult } from "./check-result.js";
import type { DevCheckRequest, DevCheckResponse } from "./dev-check.types.js";

/**
 * Checks a generation without running synchronous TypeScript work on the proxy's event loop.
 * @param request - Project root and unique generation identity for a fresh compiler process.
 * @param signal - Supersession or shutdown signal; cancellation terminates and joins the compiler.
 * @returns The ordinary check result after the child has exited.
 * @throws If the child fails, disconnects without a result, or the generation is interrupted.
 * @remarks POSIX cleanup includes the evaluator process group. Windows currently terminates
 * only the direct compiler; descendant cleanup is not covered by this transport.
 */
export async function checkDevProject(
  request: DevCheckRequest,
  signal?: AbortSignal,
): Promise<CheckResult> {
  signal?.throwIfAborted();
  const extension = import.meta.url.endsWith(".ts") ? "ts" : "js";
  const entrypoint = fileURLToPath(new URL(`./dev-check-worker.${extension}`, import.meta.url));
  // A separate process group also owns the compiler's evaluator subprocess.
  const grouped = process.platform !== "win32";
  const child = fork(entrypoint, [], {
    execPath: process.execPath,
    execArgv: ["--no-env-file", "--no-install"],
    cwd: request.projectRoot,
    detached: grouped,
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  let diagnostic = "";
  let result: DevCheckResponse | undefined;
  let failure: Error | undefined;
  child.stderr?.on("data", (chunk: Buffer) => {
    diagnostic = `${diagnostic}${chunk.toString()}`.slice(-8_192);
  });
  child.on("message", (message: DevCheckResponse) => {
    result = message;
  });
  const exited = new Promise<number | null>((resolve) => {
    child.once("error", (error) => {
      failure = error;
      // Failed spawns have no pid and do not emit exit.
      if (child.pid === undefined) resolve(null);
    });
    child.once("exit", resolve);
  });
  const terminate = (): void => {
    if (child.pid === undefined) return;
    if (grouped) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    } else if (child.exitCode === null) child.kill("SIGKILL");
  };
  signal?.addEventListener("abort", terminate, { once: true });
  try {
    if (signal?.aborted) terminate();
    else {
      child.send(request, (error) => {
        if (error) {
          failure = error;
          terminate();
        }
      });
    }
    const code = await exited;
    signal?.throwIfAborted();
    if (failure) throw failure;
    if (code !== 0 || result === undefined)
      throw new Error(`Development compiler exited (${code}): ${diagnostic}`);
    if ("error" in result) throw new Error(result.error);
    return result.result;
  } finally {
    signal?.removeEventListener("abort", terminate);
    terminate();
    await exited;
  }
}
