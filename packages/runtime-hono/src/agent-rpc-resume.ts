import { httpValidation } from "./http-validation.js";
import type { ResolvedAgent } from "./agent-rpc-resume.types.js";
import {
  isGraphDescriptor,
  validateGraphResumeInput,
  validateNativeAgentResumeInput,
} from "@relkit/agents";
import { REALTIME_RUNTIME_LIMITS, type OperationId } from "@relkit/contracts";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import { digest, type AgentInput, verifiedAgentRequestDigest } from "./agent-rpc-support.js";
import { startAgentRun } from "./agent-rpc-worker.js";
import { waitForAgentRun } from "./agent-run-tasks.js";
import { assertAgentRunWritable } from "./agent-compatibility.js";
import { Context, Effect, Layer } from "effect";
import { httpBoundary, HttpBoundaryError, observeHttp, runHttp } from "./http-effect.js";

/** Admits a resume only after revision validation and joining the interrupted run.
 * @param input - Public resume payload and observed revision.
 * @param threadId - Authorized durable thread identifier.
 * @param operationId - Idempotency identifier for continuation admission.
 * @param resolved - Authorized descriptor, provider and scope.
 * @param options - Generation and runtime dependencies.
 * @returns The accepted continuation receipt, including whether admission was a duplicate.
 */
const resume = Effect.fn("AgentContinuations.resume")(function* (
  input: AgentInput,
  threadId: string,
  operationId: OperationId,
  resolved: ResolvedAgent,
  options: RouteMaterializationOptions,
) {
  if (typeof input.waitingRevision !== "string" || input.waitingRevision.length === 0) {
    return yield* Effect.fail(resumeError("Agent resume requires the observed waiting revision."));
  }
  const requestDigest = yield* httpValidation("agent.validate", () =>
    verifiedAgentRequestDigest(input),
  );
  const snapshot = yield* httpBoundary("agent.resume.snapshot", () =>
    resolved.provider.loadThread({
      ...resolved.scope,
      threadId,
      maxEncodedBytes: REALTIME_RUNTIME_LIMITS.initialSnapshotBytes,
    }),
  );
  const waiting = snapshot.waiting;
  yield* httpValidation("agent.validate", () => assertAgentRunWritable(snapshot, waiting?.runId));
  if (waiting === undefined) {
    const prior = yield* httpBoundary("agent.resume.receipt", () =>
      resolved.provider.lookupContinuationReceipt({
        ...resolved.scope,
        operationId,
        threadId,
        semanticDigest: requestDigest,
        now: new Date().toISOString(),
      }),
    );
    if (prior.status === "found") {
      const accepted = asAcceptedRun({ ...prior.receipt, duplicate: true });
      startAgentRun(resolved, accepted, input.payload, options, true);
      return accepted;
    }
    return yield* Effect.fail(resumeError("Agent has no waiting continuation."));
  }
  if (input.waitingRevision !== waiting.revision) {
    return yield* Effect.fail(resumeError("Agent waiting revision is stale."));
  }
  const reply = yield* httpBoundary("agent.resume.validate", async () =>
    isGraphDescriptor(resolved.descriptor)
      ? validateGraphResumeInput(resolved.descriptor, waiting.requests, input.payload)
      : validateNativeAgentResumeInput(waiting.requests, input.payload),
  ).pipe(Effect.mapError(() => resumeError("Agent resume input validation failed.")));
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

/** Admits resumptions only after the prior run and its durable waiting revision settle. */
export class AgentContinuations extends Context.Service<
  AgentContinuations,
  { readonly resume: typeof resume }
>()("@relkit/runtime-hono/AgentContinuations") {}

/** Live continuation admission preserves receipt idempotency and revision fencing. */
export const AgentContinuationsLive = Layer.succeed(AgentContinuations, {
  resume: (...args) => observeHttp("agent.resume", resume(...args)),
});

/** Executes durable resume admission at the native oRPC boundary.
 * @param input - Submitted operation input; validation and authorization occur before effects are admitted.
 * @param threadId - Stable thread identifier within the authorized agent scope.
 * @param operationId - Idempotency identifier for durable admission or lookup.
 * @param resolved - Authorized agent descriptor, provider and durable request scope.
 * @param options - Application dependencies and configuration for this domain.
 * @returns The accepted continuation receipt, including whether admission was a duplicate.
 */
export function acceptAgentResume(
  input: AgentInput,
  threadId: string,
  operationId: OperationId,
  resolved: ResolvedAgent,
  options: RouteMaterializationOptions,
) {
  return runHttp(
    Effect.flatMap(AgentContinuations, (service) =>
      service.resume(input, threadId, operationId, resolved, options),
    ).pipe(Effect.provide(AgentContinuationsLive)),
  );
}

/** Retains the original validation exception at the public Promise boundary.
 * @param message - Public message included in the resulting value or failure.
 * @returns A typed boundary failure retaining the original public TypeError.
 */
function resumeError(message: string): HttpBoundaryError {
  return new HttpBoundaryError({ operation: "agent.resume", cause: new TypeError(message) });
}

/** Projects a continuation receipt into the existing accepted-run response.
 * @param continuation - Durable continuation receipt projected into accepted-run form.
 * @returns An accepted run response retaining operation, thread, run and duplicate fields.
 */
function asAcceptedRun(continuation: {
  readonly operationId: OperationId;
  readonly threadId: string;
  readonly runId: string;
  readonly duplicate: boolean;
}) {
  return {
    operationId: continuation.operationId,
    threadId: continuation.threadId,
    runId: continuation.runId,
    status: "accepted" as const,
    duplicate: continuation.duplicate,
  };
}
