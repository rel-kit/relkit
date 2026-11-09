#!/usr/bin/env node
/**
 * Native argv/signal edge: loads the CLI, which selects the owning Effect command.
 * Each command owns its service graph and physical cleanup; this edge awaits that
 * lifetime and removes only its native signal listeners.
 */
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { installInvocationSignals } from "./invocation-signals.js";
import { handOffToBun, shouldHandOffToBun } from "./runtime/bun-handoff.js";

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

// Node 22 has no `import.meta.main`; compare the entry script with this module instead.
const main =
  import.meta.main ??
  (process.argv[1] !== undefined &&
    realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)));
if (main) {
  const handedOff = shouldHandOffToBun()
    ? await handOffToBun(fileURLToPath(import.meta.url), process.argv.slice(2))
    : undefined;
  if (handedOff !== undefined) process.exitCode = handedOff;
  else {
    // On Node the CLI imports `relkit.config.ts` itself, so it registers the TypeScript hooks.
    if (typeof process.versions.bun !== "string")
      await import("./runtime/node/typescript-register.js");
    process.exitCode = await run();
  }
}
