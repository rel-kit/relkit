import { createInterface } from "node:readline/promises";
import { Effect } from "effect";
import { cliPromise, cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { cleanupEffect } from "../services/cleanup.service.js";
import { LocalCommandError } from "./local-operation-support.js";
import type { LocalCommandContext, LocalCommandDependencies } from "./local.types.js";

/**
 * Confirms reset through its existing typed-yes prompt or a compatibility callback.
 * @param message - Domain-owned destructive reset summary.
 * @param context - Existing JSON/TTY interaction policy.
 * @param dependencies - Optional explicitly injected decision callback.
 * @returns The user's decision; prompt cleanup follows fiber interruption.
 */
export const confirmLocalResetEffect = Effect.fn("Local.confirmReset")(
  function* (
    message: string,
    context: LocalCommandContext,
    dependencies: LocalCommandDependencies,
  ) {
    const custom = dependencies.confirm;
    if (custom !== undefined)
      return yield* cliPromise("local.prompt.custom", () => Promise.resolve(custom(message))).pipe(
        Effect.uninterruptible,
      );
    if (context.json || context.tty !== true)
      return yield* Effect.fail(
        new LocalCommandError(
          "RELKIT_LOCAL_USAGE",
          "local reset requires interactive confirmation or --yes.",
        ),
      );
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const terminal = yield* Effect.acquireRelease(
          cliTry("local.prompt.acquire", () =>
            createInterface({ input: process.stdin, output: process.stdout }),
          ),
          (terminal) =>
            cleanupEffect(
              "local.prompt.close",
              cliTry("local.prompt.close", () => terminal.close()),
            ),
        );
        const answer = yield* cliPromise("local.prompt.question", (signal) =>
          terminal.question(`${message} Type "yes" to continue: `, { signal }),
        );
        return answer.trim() === "yes";
      }),
    );
  },
  (
    effect,
    _message: string,
    _context: LocalCommandContext,
    _dependencies: LocalCommandDependencies,
  ) => observeCli("local.confirmReset", effect),
);
