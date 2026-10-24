/**
 * Converts supported approval reply forms to the canonical record while keeping
 * approval policy, tracing and tool lifecycle in their existing owners.
 */
import { Effect } from "effect";
import {
  approveApprovalEffect,
  denyApprovalEffect,
  type PendingApproval,
} from "@relkit/agents/internal/approval";
import { agentInvocationFailure } from "./runtime-effect-error.js";
import type { AgentApprovalHandler } from "./runtime.types.js";

/** Normalizes the supported reply forms without changing approval semantics.
 * @param approval - Pending decision being resolved.
 * @param response - Supported handler reply or canonical record.
 * @returns Canonical decision or a tagged approval failure.
 */
export const resolveApprovalDecisionEffect = Effect.fn("Agents.runtime.approvalDecision")(
  function* (approval: PendingApproval, response: Awaited<ReturnType<AgentApprovalHandler>>) {
    const decision =
      response === "approved" || response === true
        ? yield* approveApprovalEffect(approval).pipe(
            Effect.mapError((failure) => agentInvocationFailure(failure.cause)),
          )
        : response === "denied" || response === false
          ? yield* denyApprovalEffect(approval).pipe(
              Effect.mapError((failure) => agentInvocationFailure(failure.cause)),
            )
          : response;
    return decision;
  },
);
