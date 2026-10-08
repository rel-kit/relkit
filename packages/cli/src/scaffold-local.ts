import type { AddResult, PromptDriver } from "create-relkit";
import { Effect, Layer } from "effect";
import type { CliCommandContext } from "./main-support.js";
import { CliInteraction, interactionLayer } from "./cli-interaction.service.js";
import { cliOriginalError, cliPromise } from "./cli-errors.js";
import { observeCli, runCliEffect } from "./cli-runtime.js";
import { runLocal, runLocalEffect } from "./commands/local.js";
import { localLiveLayer } from "./services/local.service.js";

/**
 * Performs the separate consented startup after a successful scaffold transaction.
 * @param result - Completed public add result.
 * @param context - Existing presentation and cancellation policy.
 * @param prompt - Optional interactive driver.
 * @param start - Existing foreign callback injection for compatibility tests.
 * @returns Existing result and local startup exit code.
 */
export function finishScaffoldLocal(
  result: AddResult,
  context: CliCommandContext,
  prompt?: PromptDriver,
  start: typeof runLocal = runLocal,
) {
  return runCliEffect(
    finishScaffoldLocalEffect(result, context, prompt, start === runLocal ? undefined : start),
    interactionLayer,
    context.signal,
  );
}

/**
 * Composes explicit Docker consent and the local-service domain in the caller scope.
 * @param result - Completed public add result.
 * @param context - Existing presentation and cancellation policy.
 * @param prompt - Optional interactive driver.
 * @param start - Optional caller-owned foreign callback, adapted only at that boundary.
 * @returns Lazy result and existing exit status; no startup without positive consent.
 */
export const finishScaffoldLocalEffect = Effect.fn("Scaffold.local-consent")(
  function* (
    result: AddResult,
    context: CliCommandContext,
    prompt?: PromptDriver,
    start?: typeof runLocal,
  ) {
    const unchanged = { result, exitCode: 0 };
    if (
      !prompt ||
      context.json ||
      context.ci ||
      !context.tty ||
      context.signal.aborted ||
      result.verification.status !== "passed" ||
      !result.warnings.some((warning) => warning.code === "docker-required")
    )
      return unchanged;
    const interaction = yield* CliInteraction;
    const approved = yield* interaction
      .confirm(
        prompt,
        {
          message: "Start local Docker services now? (relkit local up --detach)",
          initialValue: true,
        },
        context.signal,
      )
      .pipe(
        Effect.catch((wrapped) => {
          const error = cliOriginalError(wrapped);
          return context.signal.aborted ||
            (error instanceof Error && "code" in error && error.code === "RELKIT_ADD_CANCELLED")
            ? Effect.succeed(false)
            : Effect.fail(wrapped);
        }),
      );
    if (!approved || context.signal.aborted) return unchanged;
    const args = ["up", "--detach", "--project-root", result.projectRoot];
    const code = yield* start === undefined
      ? runLocalEffect(args, context).pipe(Effect.provide(localLiveLayer()))
      : cliPromise("scaffold.local-start", () => start(args, context));
    return completeLocalStartup(result, code);
  },
  (effect) => observeCli("scaffold.local-consent", effect),
);

/**
 * Projects the existing post-startup warning and next-step policy.
 * @param result - Completed scaffold result.
 * @param code - Local-service exit status.
 * @returns The original result on failure plus its actionable warning, or cleaned next steps.
 */
function completeLocalStartup(
  result: AddResult,
  code: number,
): { readonly result: AddResult; readonly exitCode: number } {
  if (code !== 0)
    return {
      exitCode: code,
      result: {
        ...result,
        warnings: [
          ...result.warnings,
          {
            code: "local-start-failed",
            message:
              "Scaffold saved, but local services could not start. Resolve the error and run `relkit local up --detach`.",
          },
        ],
      },
    };
  return {
    exitCode: 0,
    result: {
      ...result,
      warnings: result.warnings.filter((warning) => warning.code !== "docker-required"),
      nextSteps: result.nextSteps.filter(
        (step) => step !== "relkit local up" && step !== "relkit local up --detach",
      ),
    },
  };
}
