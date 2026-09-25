import { fork } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { ObservabilityQueryError } from "../query-types.js";
import { WorkerTransportError, workerFailure } from "./worker-client-error.js";
import type { LocalWorkerCommand, LocalWorkerResponse } from "./types.types.js";
import type { LocalWorkerEffects } from "./worker-client.types.js";

/**
 * Starts an isolated DuckDB worker and returns its Effect operations.
 * A caller keeping the worker beyond one Effect must close it; use
 * `localWorkerLayer` for scope owned cleanup.
 *
 * @param onFailure - Receives the first unexpected worker failure.
 * @returns A live worker or a tagged start failure.
 * @example
 * const worker = Effect.runSync(startLocalWorkerEffect());
 * await Effect.runPromise(worker.close());
 */
export const startLocalWorkerEffect = Effect.fn("observability.worker.start")(function* (
  onFailure: (error: Error) => void = () => undefined,
) {
  return yield* Effect.try({
    try: (): LocalWorkerEffects => {
      const built = new URL("./duckdb-worker.js", import.meta.url);
      const workerPath = existsSync(built)
        ? built
        : new URL("../../dist/local/duckdb-worker.js", import.meta.url);
      const child = fork(fileURLToPath(workerPath), [], {
        execPath: "node",
        execArgv: [],
        stdio: ["ignore", "ignore", "pipe", "ipc"],
      });
      let nextId = 0;
      let closed = false;
      let closing = false;
      let opened = false;
      let failure: Error | undefined;
      let diagnostic = "";
      let closePromise: Promise<void> | undefined;
      const pending = new Map<
        number,
        {
          resolve: (value: unknown) => void;
          reject: (error: Error) => void;
          timer: ReturnType<typeof setTimeout>;
        }
      >();
      child.stderr?.on("data", (value: Buffer) => {
        diagnostic = `${diagnostic}${value.toString()}`.slice(-8192);
      });
      const stop = (): void => {
        if (closed) return;
        closed = true;
        if (child.connected) child.disconnect();
        child.kill();
      };
      const fail = (error: Error): void => {
        if (failure) return;
        failure = error;
        for (const item of pending.values()) {
          clearTimeout(item.timer);
          item.reject(error);
        }
        pending.clear();
        try {
          if (!closed) onFailure(error);
        } finally {
          stop();
        }
      };
      child.on("error", fail);
      child.on("exit", (code) => {
        if (!closed && (!closing || pending.size > 0))
          fail(new Error(`Telemetry worker exited (${code}): ${diagnostic}`));
      });
      child.on("message", (message: LocalWorkerResponse) => {
        if (message.fatal) {
          fail(new Error(message.error ?? "Telemetry worker failed; restart dev to recover"));
          return;
        }
        const item = pending.get(message.id);
        if (!item) return;
        clearTimeout(item.timer);
        pending.delete(message.id);
        if (message.error)
          item.reject(
            message.code
              ? new ObservabilityQueryError(message.code, message.error)
              : new WorkerTransportError("response", message.error),
          );
        else item.resolve(message.value);
      });
      const send = (command: LocalWorkerCommand, signal?: AbortSignal): Promise<unknown> => {
        if (failure || closed)
          return Promise.reject(failure ?? new Error("Telemetry worker is closed"));
        return new Promise((resolve, reject) => {
          const id = ++nextId;
          const abort = () => {
            fail(new Error("Telemetry worker interrupted"));
          };
          const cleanup = () => signal?.removeEventListener("abort", abort);
          if (signal?.aborted) {
            abort();
            reject(failure);
            return;
          }
          signal?.addEventListener("abort", abort, { once: true });
          if (signal?.aborted) {
            abort();
            reject(failure);
            return;
          }
          const timer = setTimeout(
            () => {
              fail(
                new WorkerTransportError(
                  "timeout",
                  "Telemetry worker timed out; restart dev to recover",
                ),
              );
            },
            command.type === "open" ? 120_000 : 15_000,
          );
          pending.set(id, {
            resolve: (value) => {
              cleanup();
              if (command.type === "open") opened = true;
              resolve(value);
            },
            reject: (error) => {
              cleanup();
              reject(error);
            },
            timer,
          });
          try {
            child.send({ id, command }, (error) => {
              if (error) fail(new WorkerTransportError("send", error.message));
            });
          } catch (error) {
            fail(
              new WorkerTransportError(
                "send",
                error instanceof Error ? error.message : String(error),
              ),
            );
          }
        });
      };
      const close = (): Promise<void> =>
        (closePromise ??= (async () => {
          if (closed) return;
          closing = true;
          try {
            if (!failure && opened) await send({ type: "close" });
          } finally {
            stop();
          }
        })());
      return {
        pid: child.pid,
        call: Effect.fn("observability.worker.call")((command: LocalWorkerCommand) =>
          failure
            ? Effect.fail(workerFailure(failure, "worker"))
            : closed
              ? Effect.fail(workerFailure(new Error("Telemetry worker is closed"), "closed"))
              : Effect.tryPromise({
                  try: (signal) => send(command, signal),
                  catch: (error) =>
                    workerFailure(
                      error,
                      error instanceof ObservabilityQueryError ? "response" : "worker",
                    ),
                }),
        ),
        close: Effect.fn("observability.worker.close")(() =>
          Effect.uninterruptible(
            Effect.tryPromise({
              try: close,
              catch: (error) => workerFailure(error, "worker"),
            }),
          ),
        ),
      };
    },
    catch: (error) => workerFailure(error, "start"),
  });
});
