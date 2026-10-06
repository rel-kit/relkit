import { spawn } from "node:child_process";
import { Context, Effect, Layer, Option } from "effect";
import { cliPromise, cliTry } from "./cli-errors.js";
import { observeCli } from "./cli-runtime.js";
import { CliCleanup, cleanupEffect, cleanupLayer } from "./services/cleanup.service.js";
import type {
  ContributorTerminalCapabilities,
  ContributorTerminalChild,
} from "./contributor-process.types.js";

/** Contributor subprocess authority borrowing terminal streams from the caller. */
export class ContributorTerminal extends Context.Service<
  ContributorTerminal,
  ContributorTerminalCapabilities
>()("relkit/cli/ContributorTerminal") {}

/**
 * Acquires inherited-terminal execution with process-group cancellation and finite reaping.
 * @returns A Layer retaining explicit secondary-cleanup authority.
 */
export const contributorTerminalLive = Layer.effect(
  ContributorTerminal,
  Effect.gen(function* () {
    const cleanup = yield* CliCleanup;
    return ContributorTerminal.of({
      run: Effect.fn("ContributorTerminal.run")((command: readonly string[], cwd: string) =>
        observeCli(
          "contributor.terminal",
          Effect.scoped(
            Effect.gen(function* () {
              const owned = yield* Effect.acquireRelease(
                cliTry("contributor.spawn", () => acquire(command, cwd)),
                (owned) =>
                  cleanupEffect("contributor.terminal.release", release(owned)).pipe(
                    Effect.provideService(CliCleanup, cleanup),
                  ),
              );
              return yield* cliPromise("contributor.exit", () => owned.exited);
            }),
          ),
        ),
      ),
    });
  }),
);

/** Native terminal adapter with the invocation's shared cleanup ledger. */
export const contributorTerminalLayer = contributorTerminalLive.pipe(
  Layer.provideMerge(cleanupLayer),
);

/**
 * Publishes a completion receipt immediately after spawning one owned group.
 * @param command - Nonempty literal native command vector.
 * @param cwd - Caller working directory.
 * @returns The child and original exit receipt; rejected spawn receipts stay observed.
 */
function acquire(command: readonly string[], cwd: string): ContributorTerminalChild {
  const executable = command[0];
  if (executable === undefined) throw new Error("Contributor command is empty.");
  const child = spawn(executable, command.slice(1), {
    cwd,
    env: process.env,
    stdio: "inherit",
    detached: process.platform !== "win32",
  });
  const exited = new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  void exited.catch(() => undefined);
  return { child, exited };
}

/**
 * Signals only the acquired group, suppressing only an already-gone process.
 * @param owned - Handle belonging to this scope.
 * @param signal - Termination signal selected by bounded release.
 * @returns Completion after native signal delivery.
 */
function terminate(owned: ContributorTerminalChild, signal: NodeJS.Signals) {
  return cliTry("contributor.kill", () => {
    try {
      if (process.platform === "win32") {
        if (owned.child.exitCode === null) owned.child.kill(signal);
      } else if (owned.child.pid !== undefined) process.kill(-owned.child.pid, signal);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
    }
  });
}

/**
 * Reaps the child and kills any remaining descendants without closing borrowed streams.
 * @param owned - Scope-owned child and physical exit receipt.
 * @returns Finite cleanup; stalled native receipts produce separate release evidence.
 */
const release = Effect.fn("ContributorTerminal.release")(function* (
  owned: ContributorTerminalChild,
) {
  yield* terminate(owned, "SIGTERM");
  const wait = cliPromise("contributor.reap", () =>
    owned.exited.then(
      () => undefined,
      () => undefined,
    ),
  ).pipe(Effect.interruptible);
  const graceful = yield* wait.pipe(Effect.timeoutOption(5_000));
  yield* terminate(owned, "SIGKILL");
  if (Option.isNone(graceful)) {
    const forced = yield* wait.pipe(Effect.timeoutOption(5_000));
    if (Option.isNone(forced))
      return yield* cliTry("contributor.reap", () => {
        throw new Error("Contributor process did not exit within its cleanup deadline.");
      });
  }
});
