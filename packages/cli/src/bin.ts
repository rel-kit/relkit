#!/usr/bin/env bun
/**
 * Native argv/signal edge: loads the CLI, which selects the owning Effect command.
 * Each command owns its service graph and physical cleanup; this edge awaits that
 * lifetime and removes only its native signal listeners.
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
 * Loads the CLI parser and runs the selected command.
 * @param args - Literal native invocation arguments.
 * @param signal - Existing invocation-owned cancellation.
 * @returns Established exit status after the selected command's lifetime joins.
 */
async function selectedCommand(args: readonly string[], signal: AbortSignal): Promise<number> {
  const { runCli } = await import("./main.js");
  return runCli(args, { signal, installSignalHandlers: false });
}

if (import.meta.main) process.exitCode = await run();
