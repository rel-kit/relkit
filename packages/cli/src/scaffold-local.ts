import type { AddResult, PromptDriver } from "create-relkit";
import type { CliCommandContext } from "./main-support.js";
import { runLocal } from "./commands/local.js";

/** Startup is a separate, consented action after the scaffold transaction succeeds. */
export async function finishScaffoldLocal(
  result: AddResult,
  context: CliCommandContext,
  prompt?: PromptDriver,
  start: typeof runLocal = runLocal,
): Promise<{ readonly result: AddResult; readonly exitCode: number }> {
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
  let approved: boolean;
  try {
    approved = await prompt.confirm({
      message: "Start local Docker services now? (relkit local up --detach)",
      initialValue: true,
    });
  } catch (error) {
    if (
      context.signal.aborted ||
      (error instanceof Error && "code" in error && error.code === "RELKIT_ADD_CANCELLED")
    )
      return unchanged;
    throw error;
  }
  if (!approved || context.signal.aborted) return unchanged;
  const code = await start(["up", "--detach", "--project-root", result.projectRoot], context);
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
