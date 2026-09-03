import { fork } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { LocalWorkerCommand, LocalWorkerResponse } from "./types.js";
import { ObservabilityQueryError } from "../query-types.js";

export function startLocalWorker(onFailure: (error: Error) => void = () => undefined) {
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
  let opened = false;
  let failure: Error | undefined;
  let diagnostic = "";
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
  const fail = (error: Error): void => {
    if (failure) return;
    failure = error;
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    pending.clear();
    if (!closed) onFailure(error);
  };
  child.on("error", fail);
  child.on("exit", (code) => {
    if (!closed) fail(new Error(`Telemetry worker exited (${code}): ${diagnostic}`));
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
          : new Error(message.error),
      );
    else item.resolve(message.value);
  });
  const call = <T>(command: LocalWorkerCommand): Promise<T> => {
    if (failure || closed)
      return Promise.reject(failure ?? new Error("Telemetry worker is closed"));
    return new Promise<T>((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(
        () => {
          fail(new Error("Telemetry worker timed out; restart dev to recover"));
          child.kill();
        },
        command.type === "open" ? 120_000 : 15_000,
      );
      pending.set(id, {
        resolve: (value) => {
          if (command.type === "open") opened = true;
          resolve(value as T);
        },
        reject,
        timer,
      });
      child.send({ id, command }, (error) => {
        if (error) fail(error);
      });
    });
  };
  const close = async (): Promise<void> => {
    if (closed) return;
    try {
      if (!failure && opened) await call({ type: "close" });
    } finally {
      closed = true;
      if (child.connected) child.disconnect();
      child.kill();
    }
  };
  return { call, close };
}
