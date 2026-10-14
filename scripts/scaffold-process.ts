/** Owns native child termination, output draining and finite command deadlines for scaffold evidence. */
import { Context, Effect, Layer } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { ScaffoldProcessFailure } from "./scaffold-process.errors.js";
import type { ScaffoldChild, ScaffoldCommand } from "./scaffold-process.types.js";

/**
 * Starts one native child and joins its exit/output before releasing ownership.
 * @param command - Exact command, root and isolated child environment overrides.
 * @returns A scope-owned child with both output streams already draining.
 */
export const scaffoldChild = Effect.fn("ScaffoldProcess.acquire")((command: ScaffoldCommand) =>
  Effect.acquireRelease(
    Effect.try({
      try: (): ScaffoldChild => {
        let executable = globalThis.process.execPath;
        if (command.executable === "node" || command.executable === "git")
          executable = command.executable;
        const process = Bun.spawn([executable, ...command.args], {
          cwd: command.cwd,
          detached: true,
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
          env: {
            ...globalThis.process.env,
            ...command.env,
            ...(command.registry === undefined
              ? {}
              : {
                  BUN_CONFIG_REGISTRY: command.registry,
                  npm_config_registry: command.registry,
                }),
            ...(command.cacheDir === undefined ? {} : { BUN_INSTALL_CACHE_DIR: command.cacheDir }),
          },
        });
        let stdoutText = "",
          stderrText = "";
        let timer: ReturnType<typeof setTimeout> | undefined;
        const stop = (): void => {
          if (timer !== undefined) return;
          signalScaffoldGroup(process.pid, "SIGTERM");
          timer = setTimeout(() => signalScaffoldGroup(process.pid, "SIGKILL"), 2000);
        };
        const stdout = observedScaffoldOutput(stop, process.stdout, (text) => {
          stdoutText = text;
        });
        const stderr = observedScaffoldOutput(stop, process.stderr, (text) => {
          stderrText = text;
        });
        const settled = Promise.allSettled([process.exited, stdout, stderr]);
        return {
          process,
          stdout,
          stderr,
          output: () => stdoutText + stderrText,
          settled,
          release: async () => {
            stop();
            try {
              const results = await settled;
              const failures = results.flatMap((result) =>
                result.status === "rejected"
                  ? [new Error("Owned scaffold child settlement failed", { cause: result.reason })]
                  : [],
              );
              if (failures.length > 0)
                throw new AggregateError(failures, "Scaffold child release failed");
            } finally {
              clearTimeout(timer);
            }
          },
        };
      },
      catch: (cause) =>
        new ScaffoldProcessFailure({
          operation: "process.spawn",
          message: `Cannot spawn ${command.args.join(" ")}: ${cause instanceof Error ? cause.message : "native spawn failed"}`,
        }),
    }),
    (owner) => Effect.promise(owner.release),
  ),
);

/**
 * Executes a finite native command within its own child scope.
 * @param command - Installed command and exact environment selection.
 * @returns Complete stdout after exit and both drains settle.
 */
const executeCommand = Effect.fn("ScaffoldProcess.run")(
  function* (command: ScaffoldCommand) {
    const owner = yield* scaffoldChild(command);
    const [exit, out, error] = yield* Effect.promise(() => owner.settled);
    if (exit.status !== "fulfilled" || out.status !== "fulfilled" || error.status !== "fulfilled")
      return yield* new ScaffoldProcessFailure({
        operation: "process.drain",
        message: "Native child exit/output could not be completed",
      });
    const code = exit.value,
      stdout = out.value,
      stderr = error.value;
    if (code !== 0)
      return yield* new ScaffoldProcessFailure({
        operation: "process.exit",
        message: `${command.args.join(" ")} failed in ${command.cwd} (${code})\n${stdout}${stderr}`,
      });
    return stdout;
  },
  (effect) =>
    observeExecution(
      "testing",
      "scaffold.command",
      effect.pipe(Effect.scoped, Effect.timeout("10 minutes")),
    ),
);

/** Native command authority is acquired only by a finite script invocation. */
export class ScaffoldProcess extends Context.Service<ScaffoldProcess>()(
  "relkit.scripts.ScaffoldProcess",
  {
    make: Effect.succeed({ run: executeCommand }),
  },
) {}
export const scaffoldProcessLayer = Layer.effect(ScaffoldProcess, ScaffoldProcess.make);

/**
 * Signals only a detached process group created by this resource owner.
 * @param pid - Native child PID, also its detached group identity.
 * @param signal - Graceful or bounded forced termination.
 * @returns Completion when the signal is delivered or the group has already exited.
 */
export function signalScaffoldGroup(pid: number, signal: "SIGTERM" | "SIGKILL"): void {
  try {
    globalThis.process.kill(-pid, signal);
  } catch (cause) {
    if (!(cause instanceof Error) || !("code" in cause) || cause.code !== "ESRCH") throw cause;
  }
}

/**
 * Drains one native stream while retaining bounded diagnostic output for failure reporting.
 * @param stream - Child-owned native output stream.
 * @param update - Borrowed output observer, called only during this drain.
 * @returns Complete bounded output after the stream closes and its reader releases.
 */
async function drainScaffoldOutput(
  stream: ReadableStream<Uint8Array>,
  update: (text: string) => void,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      output += decoder.decode(chunk.value, { stream: true });
      if (output.length > 4_194_304) throw new Error("Scaffold child output exceeded its bound");
      update(output);
    }
    output += decoder.decode();
    update(output);
    return output;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Stops a producer on a failed output drain; the child-owned settled barrier observes every rejection immediately.
 * @param stop - Idempotent bounded termination of the owned detached producer.
 * @param stream - Native output stream.
 * @param update - Borrowed bounded diagnostic observer.
 * @returns The original drain Promise, joined by both command execution and release.
 */
function observedScaffoldOutput(
  stop: () => void,
  stream: ReadableStream<Uint8Array>,
  update: (text: string) => void,
) {
  return drainScaffoldOutput(stream, update).catch((cause) => {
    stop();
    throw cause;
  });
}
