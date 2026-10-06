import { spawn } from "node:child_process";
import type { Readable } from "node:stream";
import { Context, Effect, Layer, Option, Ref, Stream } from "effect";
import { cliAdapterError, cliPromise, cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import type { OwnedProcess, ProcessCapabilities, ProcessRequest } from "./process.types.js";
import { CliCleanup, cleanupEffect, cleanupLayer } from "./cleanup.service.js";

/** Scoped subprocess execution; each call owns its process group and concurrent pipe readers. */
export class CliProcess extends Context.Service<CliProcess, ProcessCapabilities>()(
  "relkit/cli/Process",
) {}

/**
 * Creates one native handle and installs exit listeners before asynchronous events can fire.
 * @param request - Native command and bounded capture policy.
 * @returns An owned handle, with spawn failures retained by its exit Promise.
 */
function spawnProcess(request: ProcessRequest): OwnedProcess {
  const child = spawn(request.command, [...request.args], {
    cwd: request.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
    ...(request.environment === undefined ? {} : { env: { ...request.environment } }),
  });
  const exited = new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  // This listener owns only native rejection admission; callers still await the original Promise.
  void exited.catch(() => undefined);
  return { child, stdout: child.stdout, stderr: child.stderr, exited };
}

/**
 * Terminates only the acquired process group and waits for native reaping.
 * @param owned - Native handle belonging to this scope.
 * @returns Cleanup after group termination; genuine cleanup failures remain defects.
 */
const releaseProcess = Effect.fn("CliProcess.release")(function* (owned: OwnedProcess) {
  yield* cliTry("process.kill", () => {
    try {
      if (process.platform === "win32") {
        if (owned.child.exitCode === null) owned.child.kill("SIGKILL");
      } else if (owned.child.pid !== undefined) process.kill(-owned.child.pid, "SIGKILL");
    } catch (cause) {
      if (!(cause instanceof Error && "code" in cause && cause.code === "ESRCH")) throw cause;
    }
  });
  // A rejected spawn wait is reported by run; it still has no live child left to reap.
  const reaped = yield* Effect.promise(() =>
    owned.exited.then(
      () => undefined,
      () => undefined,
    ),
  ).pipe(Effect.interruptible, Effect.timeoutOption(5_000));
  if (Option.isNone(reaped))
    return yield* cliTry("process.reap", () => {
      throw new Error("Process did not exit within the cleanup deadline.");
    });
});

/**
 * Reads one pipe concurrently with exit, bounding bytes before UTF-8 decoding.
 * @param pipe - Native stdout or stderr pipe owned by the process.
 * @param maximumBytes - Per-pipe admission bound.
 * @returns Captured text or a typed read/size failure; iterator cleanup follows interruption.
 */
const readPipe = Effect.fn("CliProcess.readPipe")(function* (pipe: Readable, maximumBytes: number) {
  const bytes = yield* Ref.make(0);
  const input: AsyncIterable<unknown> = {
    [Symbol.asyncIterator]: () => {
      const iterator = pipe[Symbol.asyncIterator]();
      return {
        next: () => iterator.next(),
        return: () => {
          // Node's iterator.return waits behind an outstanding next(). Close the
          // owned pipe first so its pending read settles before process reaping.
          pipe.destroy();
          return iterator.return?.() ?? Promise.resolve({ done: true, value: undefined });
        },
      };
    },
  };
  return yield* Stream.fromAsyncIterable(input, (cause) =>
    cliAdapterError("process.read", cause),
  ).pipe(
    Stream.mapEffect((chunk) =>
      Effect.gen(function* () {
        const value = yield* cliTry("process.chunk", () => {
          if (!(chunk instanceof Uint8Array)) throw new TypeError("Process output was not bytes.");
          return chunk;
        });
        const size = yield* Ref.updateAndGet(bytes, (size) => size + value.byteLength);
        if (size > maximumBytes)
          return yield* cliTry("process.outputLimit", () => {
            throw new Error("Process output exceeded its byte limit.");
          });
        return value;
      }),
    ),
    Stream.decodeText(),
    Stream.mkString,
  );
});

/**
 * Acquires native process execution without background jobs or cross-invocation caches.
 * @returns A live Layer; every run owns and reaps a fresh process scope.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * const output = await Effect.runPromise(Effect.gen(function* () {
 *   const processes = yield* CliProcess;
 *   return yield* processes.run({ command: process.execPath, args: ["--version"], cwd: process.cwd() });
 * }).pipe(Effect.provide(processLayer)));
 * ```
 */
export const processLayer = Layer.effect(
  CliProcess,
  Effect.gen(function* () {
    const cleanup = yield* CliCleanup;
    return CliProcess.of({
      run: Effect.fn("CliProcess.run")((request: ProcessRequest) =>
        observeCli(
          "process.run",
          Effect.scoped(
            Effect.gen(function* () {
              const owned = yield* Effect.acquireRelease(
                cliTry("process.spawn", () => spawnProcess(request)),
                (owned) =>
                  cleanupEffect("process.release", releaseProcess(owned)).pipe(
                    Effect.provideService(CliCleanup, cleanup),
                  ),
              );
              const maximumBytes = request.maximumOutputBytes ?? 8 * 1024 * 1024;
              const [exitCode, stdout, stderr] = yield* Effect.all(
                [
                  cliPromise("process.exit", () => owned.exited),
                  readPipe(owned.stdout, maximumBytes),
                  readPipe(owned.stderr, maximumBytes),
                ],
                { concurrency: 3 },
              );
              return { exitCode, stdout, stderr };
            }),
          ),
        ),
      ),
    });
  }),
).pipe(Layer.provideMerge(cleanupLayer));
