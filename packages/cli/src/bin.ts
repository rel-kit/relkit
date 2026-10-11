#!/usr/bin/env bun
/**
 * Native argv/signal edge selects the owning Effect command before importing it.
 * Prepared and safe commands each own their service graph and physical cleanup;
 * this edge awaits that lifetime and removes only its native signal listeners.
 */
import { installInvocationSignals } from "./invocation-signals.js";

/**
 * Runs one executable invocation and removes its temporary native signal handlers.
 * @param args - Literal CLI arguments, defaulting to the native argv.
 * @returns Existing command or signal-specific exit status.
 */
export async function run(args: readonly string[] = process.argv.slice(2)): Promise<number> {
  const controller = new AbortController();
  const removeSignals = installInvocationSignals(controller);
  try {
    return await selectedCommand(args, controller.signal);
  } catch (error) {
    if (
      controller.signal.aborted &&
      controller.signal.reason instanceof Error &&
      "exitCode" in controller.signal.reason &&
      typeof controller.signal.reason.exitCode === "number"
    )
      return controller.signal.reason.exitCode;
    throw error;
  } finally {
    removeSignals();
  }
}

/**
 * Loads only the selected startup graph; help/global syntax retains the full parser.
 * @param args - Literal native invocation arguments.
 * @param signal - Existing invocation-owned cancellation.
 * @returns Established exit status after the selected command's lifetime joins.
 */
async function selectedCommand(args: readonly string[], signal: AbortSignal): Promise<number> {
  if (args[0] === "dev" && args.includes("--prepare") && !args.includes("--help")) {
    const prepared = await import("./dev-snapshot/snapshot-preparation-entry.js");
    return prepared.runSnapshotPreparation(args.slice(1), signal);
  }
  if (
    args[0] === "dev" &&
    !args.some(
      (argument) =>
        ["--help", "--version", "--prepare"].includes(argument) || argument.startsWith("--json"),
    )
  ) {
    const prepared = await import("./dev-snapshot/snapshot-command-entry.js");
    if (await prepared.runPreparedDev(args.slice(1), signal)) return 0;
  }
  const { runCli } = await import("./main.js");
  return runCli(args, { signal, installSignalHandlers: false });
}

if (import.meta.main) process.exitCode = await run();
