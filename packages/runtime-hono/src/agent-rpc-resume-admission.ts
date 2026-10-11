/**
 * Performs durable duplicate lookup and revision-fenced continuation admission.
 * The caller supplies authorized request/provider scope; validators load through
 * their narrow entrypoint and accepted execution stays owned by generation tasks.
 */
import { REALTIME_RUNTIME_LIMITS, type OperationId } from "@relkit/contracts";
import type { ContinuationReceipt } from "@relkit/agents";
import { Effect } from "effect";
import { httpBoundary, HttpBoundaryError } from "./http-effect.js";
import { digest, type AgentInput } from "./agent-rpc-support.js";
import { startAgentRun } from "./agent-rpc-worker.js";
import { waitForAgentRun } from "./agent-run-tasks.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import type { ResolvedAgent, WaitingAgentContinuation } from "./agent-rpc-resume.types.js";

/**
 * Recovers an already admitted receipt without creating a second continuation.
 * @param input - Submitted payload used only to resume an existing accepted run.
 * @param threadId - Authorized durable thread identity.
 * @param operationId - Stable idempotency identity.
 * @param resolved - Current descriptor/provider authority.
 * @param options - Generation task owner and execution dependencies.
 * @param requestDigest - Verified request identity for duplicate comparison.
 * @returns Existing accepted receipt or typed missing-continuation rejection.
 */
export const lookupAgentContinuation = Effect.fn("AgentContinuations.lookup")(function* (
  input: AgentInput,
  threadId: string,
  operationId: OperationId,
  resolved: ResolvedAgent,
  options: RouteMaterializationOptions,
  requestDigest: string,
) {
  const prior = yield* httpBoundary("agent.resume.receipt", () =>
    resolved.provider.lookupContinuationReceipt({
      ...resolved.scope,
      operationId,
      threadId,
      semanticDigest: requestDigest,
      now: new Date().toISOString(),
    }),
  );
  if (prior.status !== "found") return yield* resumeError("Agent has no waiting continuation.");
  const accepted = asAcceptedRun({ ...prior.receipt, duplicate: true });
  startAgentRun(resolved, accepted, input.payload, options, true);
  return accepted;
});

/**
 * Validates the waiting revision and reply before joining and admitting a new run.
 * @param input - Submitted revision and reply.
 * @param threadId - Authorized durable thread identity.
 * @param operationId - Stable idempotency identity.
 * @param resolved - Current descriptor/provider authority.
 * @param options - Owning generation dependencies.
 * @param requestDigest - Verified request digest for durable admission.
 * @param waiting - Provider-owned waiting state, never a caller assertion.
 * @returns Accepted receipt after the interrupted run joins; typed failures preserve fencing.
 */
export const admitAgentContinuation = Effect.fn("AgentContinuations.admit")(function* (
  input: AgentInput,
  threadId: string,
  operationId: OperationId,
  resolved: ResolvedAgent,
  options: RouteMaterializationOptions,
  requestDigest: string,
  waiting: WaitingAgentContinuation,
) {
  if (input.waitingRevision !== waiting.revision)
    return yield* resumeError("Agent waiting revision is stale.");
  const reply = yield* httpBoundary("agent.resume.validate", async () => {
    const validators = await import("@relkit/agents/continuation-validation");
    return validators.isGraphDescriptor(resolved.descriptor)
      ? validators.validateGraphResumeInput(resolved.descriptor, waiting.requests, input.payload)
      : validators.validateNativeAgentResumeInput(waiting.requests, input.payload);
  }).pipe(Effect.mapError(() => resumeError("Agent resume input validation failed.")));
  yield* httpBoundary("agent.resume.join", () => waitForAgentRun(waiting.runId));
  const continuation = yield* httpBoundary("agent.resume.admit", () =>
    resolved.provider.admitContinuation({
      ...resolved.scope,
      kind: "resume",
      operationId,
      semanticDigest: requestDigest,
      threadId,
      interruptedRunId: waiting.runId,
      interruptSetDigest: digest(waiting),
      waitingRevision: waiting.revision,
      admittedAt: new Date().toISOString(),
      receiptExpiresAt: new Date(Date.now() + REALTIME_RUNTIME_LIMITS.agentReceiptMs).toISOString(),
    }),
  );
  const accepted = asAcceptedRun(continuation);
  startAgentRun(resolved, accepted, reply, options, true);
  return accepted;
});

/**
 * Retains the existing public validation failure at the native compatibility edge.
 * @param message - Fixed public validation message.
 * @returns Typed failure retaining the original public TypeError.
 */
export function resumeError(message: string): HttpBoundaryError {
  return new HttpBoundaryError({ operation: "agent.resume", cause: new TypeError(message) });
}

/**
 * Projects a provider continuation receipt to the existing accepted-run response.
 * @param continuation - Provider-owned durable receipt, including duplicate status.
 * @returns Complete accepted run identity with the existing status discriminant.
 */
function asAcceptedRun(
  continuation: Pick<ContinuationReceipt, "operationId" | "threadId" | "runId"> & {
    readonly duplicate: boolean;
  },
) {
  return {
    operationId: continuation.operationId,
    threadId: continuation.threadId,
    runId: continuation.runId,
    status: "accepted" as const,
    duplicate: continuation.duplicate,
  };
}
