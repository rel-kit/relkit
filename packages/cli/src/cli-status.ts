import { spinner } from "@clack/prompts";
import { Effect, MutableRef, Ref } from "effect";
import type { CliRuntime } from "./main-support.js";
import type { CliStatus, ScaffoldStatus } from "./cli-interaction.types.js";

/**
 * Identifies invocations that run until interrupted.
 * @param command - Declared command label.
 * @param args - Serialized invocation arguments; subcommands lead.
 * @returns True when the invocation owns the terminal until Ctrl+C.
 * @remarks A spinner would put stdin in raw mode and turn Ctrl+C into @clack's
 * process.exit(0), skipping scoped cleanup of child processes and streams.
 */
function ownsTerminal(command: string, args: readonly string[]): boolean {
  if (["create", "add", "dev", "start", "inspector"].includes(command)) return true;
  return command === "jobs" && args[0] === "runs" && args[1] === "watch";
}

/**
 * Creates the existing synchronous presentation facade.
 * @param runtime - Invocation presentation settings.
 * @param json - Whether output must remain machine-readable.
 * @param command - Declared command label.
 * @param args - Serialized invocation arguments.
 * @returns An idempotent native callback facade.
 * @remarks The Effect owner below closes this facade on interruption.
 */
export function createCliStatus(
  runtime: CliRuntime,
  json: boolean,
  command: string,
  args: readonly string[] = [],
): CliStatus {
  const enabled = !ownsTerminal(command, args);
  const status = createScaffoldStatus(runtime, json, enabled);
  return {
    start: () => status.start(`relkit ${command}`),
    message: status.message,
    finish: (ok) => status.finish(ok, `relkit ${command}`),
  };
}

/**
 * Owns a finite command spinner in the invocation scope.
 * @param runtime - Invocation presentation settings.
 * @param json - Machine-readable output selection.
 * @param command - Declared command label.
 * @param args - Serialized invocation arguments.
 * @returns A scoped status facade; cleanup finishes an outstanding spinner once.
 */
export function createCliStatusEffect(
  runtime: CliRuntime,
  json: boolean,
  command: string,
  args: readonly string[] = [],
) {
  return Effect.acquireRelease(
    Effect.sync(() => createCliStatus(runtime, json, command, args)),
    (status) => Effect.sync(() => status.finish(false)),
  );
}

/**
 * Owns one mutation spinner through completion and rollback.
 * @param runtime - Invocation presentation settings.
 * @param json - Machine-readable output selection.
 * @param failureMessage - Existing failure text used only for unfinished cleanup.
 * @returns A scoped synchronous progress facade.
 */
export function createScaffoldStatusEffect(
  runtime: CliRuntime,
  json: boolean,
  failureMessage: string,
) {
  return Effect.acquireRelease(
    Effect.sync(() => createScaffoldStatus(runtime, json)),
    (status) => Effect.sync(() => status.finish(false, failureMessage)),
  );
}

/**
 * Adapts Clack callbacks to invocation-local state without starting another runner.
 * @param runtime - Invocation presentation settings.
 * @param json - Machine-readable output selection.
 * @param allowed - Whether the selected command displays a spinner.
 * @returns A native callback facade with one explicit lifetime owner.
 * @remarks MutableRef is used only at the synchronous native callback boundary;
 * workflow decisions remain lazy Effects and each facade receives its own Ref.
 */
function createScaffoldStatus(runtime: CliRuntime, json: boolean, allowed = true): ScaffoldStatus {
  const enabled =
    allowed &&
    !json &&
    runtime.io === undefined &&
    !(runtime.ci ?? Boolean(process.env.CI)) &&
    (runtime.tty ?? process.stderr.isTTY) === true;
  const value = enabled ? spinner() : undefined;
  const state = Ref.makeUnsafe<"idle" | "active" | "closed">("idle");
  const start = (message: string) => {
    if (value && MutableRef.get(state.ref) === "idle") {
      MutableRef.set(state.ref, "active");
      value.start(message);
    }
  };
  return {
    start,
    message: (message) => {
      if (MutableRef.get(state.ref) === "closed") return;
      if (MutableRef.get(state.ref) === "idle") start(message);
      else value?.message(message);
    },
    finish: (ok, message) => {
      const current = MutableRef.get(state.ref);
      MutableRef.set(state.ref, "closed");
      if (value && current === "active") ok ? value.stop(message) : value.error(message);
    },
  };
}
