import { isInvocationFailure } from "@relkit/invocation";
import type { ExecutionOutcome } from "@relkit/runtime-effect";
import { Cause, Exit } from "effect";

/**
 * Classifies the kernel's existing public failures at the engine observation boundary.
 * @typeParam A - Successful invocation value.
 * @typeParam E - Invocation failure or continuation value.
 * @param exit - Original Effect exit; defects and mixed causes retain their precedence.
 * @param suspended - Whether the kernel identified nonterminal continuation before unwrapping it.
 * @returns False for suspension, a semantic public outcome, or true for Cause classification.
 * @remarks The invocation kernel remains the authority for failure identity and normalization.
 */
export function invocationTerminal<A, E>(
  exit: Exit.Exit<A, E>,
  suspended = false,
): boolean | ExecutionOutcome {
  if (suspended) return false;
  if (Exit.isSuccess(exit) || Cause.hasDies(exit.cause) || Cause.hasInterruptsOnly(exit.cause))
    return true;
  const failure = Cause.squash(exit.cause);
  if (!isInvocationFailure(failure)) return true;
  if (failure.kind === "defect") return "defect";
  return failure.kind === "cancellation" ? "interrupted" : "failure";
}
