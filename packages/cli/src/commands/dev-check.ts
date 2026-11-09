/**
 * Client of the warm development checker (`dev-check-worker`). The first check forks the
 * worker in its own process group with the project root as working directory; later checks
 * reuse it, so module evaluation stays warm across saves. Checks are sent one at a time and
 * answered in order. A worker that exits fails the pending check with its stderr tail and
 * is replaced by the next check. `close` kills the whole group, which also reaps the warm
 * evaluator the worker started, and waits for the worker to exit.
 */
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Effect, Layer, Schema, Semaphore } from "effect";
import { cliPromise, cliTry } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { devCheckResponseSchema } from "./dev-check.schemas.js";
import type { CheckResult } from "./check-result.js";
import type { DevCheckRequest } from "./dev-check.types.js";
import type { DevChecker, DevCheckerWorker } from "./dev-check-client.types.js";
import { nodeTypeScriptFlags, runtime } from "../runtime/index.js";
export type { DevChecker } from "./dev-check-client.types.js";

/**
 * Creates a lazily started warm checker.
 * @returns Check and close operations.
 */
export function createDevChecker(): DevChecker {
  let worker: DevCheckerWorker | undefined;
  let nextId = 0;
  let reimported: readonly string[] = [];
  const serial = Semaphore.makeUnsafe(1);
  const close = Effect.promise(async () => {
    const owned = worker;
    worker = undefined;
    if (owned !== undefined) await stopWorker(owned);
  });
  const check = Effect.fn("Dev.check")(
    function* (request: DevCheckRequest) {
      if (worker === undefined || worker.root !== request.projectRoot || worker.exited) {
        yield* close;
        worker = yield* cliTry("dev.compiler.spawn", () => startWorker(request.projectRoot));
      }
      const owned = worker;
      nextId += 1;
      const id = nextId;
      const response = yield* cliPromise("dev.compiler.check", () =>
        owned.request({ ...request, id }),
      );
      return yield* cliTry("dev.compiler.result", (): CheckResult => {
        if (!Schema.is(devCheckResponseSchema)(response))
          throw new TypeError("Development compiler returned an invalid response.");
        if ("error" in response) throw new Error(response.error);
        reimported = response.reimported ?? [];
        return response.result;
      });
    },
    (effect) => observeCli("dev.compiler.check", serial.withPermits(1)(effect)),
  );
  return { check, close, reimported: () => reimported };
}

/**
 * Checks once in a checker of its own, at the public Promise boundary.
 * @param request - Project root and generation identity.
 * @param signal - Cancels the check; the worker group is killed either way.
 * @returns The check result after the worker and its evaluator have been reaped.
 * @throws The cancellation reason when cancelled, or the worker failure.
 */
export async function checkDevProject(
  request: DevCheckRequest,
  signal?: AbortSignal,
): Promise<CheckResult> {
  const checker = createDevChecker();
  try {
    return await runCliEffect(checker.check(request), Layer.empty, signal);
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    throw error;
  } finally {
    await runCliEffect(checker.close, Layer.empty);
  }
}

/**
 * Forks the worker and wires its response channel.
 * @param root - Project root and working directory.
 * @returns The running worker.
 */
function startWorker(root: string): DevCheckerWorker {
  const extension = import.meta.url.endsWith(".ts") ? "ts" : "js";
  const entry = fileURLToPath(new URL(`./dev-check-worker.${extension}`, import.meta.url));
  const grouped = process.platform !== "win32";
  const child = fork(entry, [], {
    execPath: process.execPath,
    execArgv: workerFlags(),
    cwd: root,
    detached: grouped,
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  let stderr = "";
  const waiting = new Map<
    number,
    { resolve: (value: object) => void; reject: (error: Error) => void }
  >();
  const state: DevCheckerWorker = {
    root,
    child,
    grouped,
    exited: false,
    request: (message) =>
      new Promise<object>((resolve, reject) => {
        waiting.set(message.id, { resolve, reject });
        child.send(message, (error) => {
          if (error) {
            waiting.delete(message.id);
            reject(error);
          }
        });
      }),
  };
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr = `${stderr}${chunk.toString()}`.slice(-8_192);
  });
  child.on("message", (message: { readonly id?: number }) => {
    const entry = typeof message.id === "number" ? waiting.get(message.id) : undefined;
    waiting.delete(message.id ?? -1);
    entry?.resolve(message);
  });
  child.once("exit", (code) => {
    state.exited = true;
    for (const entry of waiting.values())
      entry.reject(new Error(`Development compiler exited (${code}): ${stderr}`));
    waiting.clear();
  });
  return state;
}

/**
 * Kills the worker's process group and waits up to five seconds for it to exit.
 * @param worker - Running worker.
 */
async function stopWorker(worker: DevCheckerWorker): Promise<void> {
  const { child } = worker;
  if (child.pid === undefined || worker.exited) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  try {
    if (worker.grouped) process.kill(-child.pid, "SIGKILL");
    else child.kill("SIGKILL");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
  }
  // A cleared timer, so a worker that exits at once does not hold the process for the deadline.
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    exited,
    new Promise<void>((resolve) => (timer = setTimeout(resolve, 5_000))),
  ]);
  clearTimeout(timer);
  child.removeAllListeners();
  child.stderr?.removeAllListeners();
}

/**
 * Runtime flags of the check worker, which imports `relkit.config.ts` itself.
 * @returns Bun's flags, or the TypeScript hooks on Node.
 */
function workerFlags(): string[] {
  if (runtime.name === "bun") return ["--no-env-file", "--no-install"];
  return nodeTypeScriptFlags().slice(1);
}
