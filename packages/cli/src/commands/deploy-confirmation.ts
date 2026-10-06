import { createInterface } from "node:readline/promises";
import { Effect, Layer } from "effect";
import { cliPromise, cliTry } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { cleanupEffect, cleanupLayer } from "../services/cleanup.service.js";

/**
 * Owns the existing interactive deployment confirmation and its readline interface.
 * @param question - Destructive/security summary already constructed by the domain.
 * @returns A lazy confirmation; non-TTY callers decline and interruption stays interruption.
 */
export const confirmDeploymentEffect = Effect.fn("Deployment.confirm")(
  function* (question: string) {
    if (!process.stdin.isTTY) return false;
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const readline = yield* Effect.acquireRelease(
          cliTry("deploy.prompt.acquire", () =>
            createInterface({ input: process.stdin, output: process.stderr }),
          ),
          (readline) =>
            cleanupEffect(
              "deploy.prompt.close",
              cliTry("deploy.prompt.close", () => readline.close()),
            ),
        );
        const answer = yield* cliPromise("deploy.prompt.question", (signal) =>
          readline.question(`${question} [y/N] `, { signal }),
        );
        return /^(y|yes)$/i.test(answer.trim());
      }),
    );
  },
  (effect, _question: string) => observeCli("deployment.confirm", effect),
);

/**
 * Retains the public Promise confirmation boundary.
 * @param question - Confirmation text.
 * @param signal - Caller-owned cancellation.
 * @returns A confirmed/declined answer after native interface cleanup.
 */
export function confirmDeployment(question: string, signal: AbortSignal): Promise<boolean> {
  return runCliEffect(confirmDeploymentEffect(question), cleanupLayer, signal);
}
