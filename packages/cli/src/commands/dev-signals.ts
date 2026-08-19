import type { DevLog, DevOptions } from "./dev.js";

export function installDevSignals(
  options: DevOptions,
  log: DevLog,
  stop: (reason: unknown) => void | Promise<void>,
): () => void {
  let processHandlers: readonly [() => void, () => void, () => void] | undefined;
  let abortHandler: (() => void) | undefined;
  if (options.installSignalHandlers !== false) {
    const handle = (signal: "SIGINT" | "SIGTERM" | "SIGHUP"): void => {
      log({ level: "info", event: "dev.shutdown.requested", fields: { signal } });
      void stop(new Error(`Received ${signal}.`));
    };
    const sigint = () => handle("SIGINT");
    const sigterm = () => handle("SIGTERM");
    const sighup = () => handle("SIGHUP");
    processHandlers = [sigint, sigterm, sighup];
    process.on("SIGINT", sigint);
    process.on("SIGTERM", sigterm);
    process.on("SIGHUP", sighup);
  }
  if (options.signal !== undefined) {
    if (options.signal.aborted) void stop(options.signal.reason);
    else {
      abortHandler = () => void stop(options.signal?.reason);
      options.signal.addEventListener("abort", abortHandler, { once: true });
    }
  }
  return () => {
    if (processHandlers !== undefined) {
      process.removeListener("SIGINT", processHandlers[0]);
      process.removeListener("SIGTERM", processHandlers[1]);
      process.removeListener("SIGHUP", processHandlers[2]);
    }
    if (options.signal !== undefined && abortHandler !== undefined)
      options.signal.removeEventListener("abort", abortHandler);
  };
}
