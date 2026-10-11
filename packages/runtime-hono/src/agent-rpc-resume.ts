/**
 * Owns request-level continuation admission through a replaceable Effect service.
 * Authorization remains supplied by the request; durable lookup, validation and
 * generation-owned execution use the narrow admission helpers without agent runtime imports.
 */
import { REALTIME_RUNTIME_LIMITS, type OperationId } from "@relkit/contracts";
import { Context, Effect, Layer } from "effect";
import { httpValidation } from "./http-validation.js";
import { httpBoundary, observeHttp, runHttp } from "./http-effect.js";
import { assertAgentRunWritable } from "./agent-compatibility.js";
import { verifiedAgentRequestDigest, type AgentInput } from "./agent-rpc-support.js";
import {
  admitAgentContinuation,
  lookupAgentContinuation,
  resumeError,
} from "./agent-rpc-resume-admission.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import type { AgentContinuationOperations, ResolvedAgent } from "./agent-rpc-resume.types.js";

/**
 * Admits a resume after provider snapshot validation and interrupted-run joining.
 * @param input - Submitted payload and observed revision.
 * @param threadId - Authorized durable thread identity.
 * @param operationId - Stable continuation idempotency identity.
 * @param resolved - Fresh request descriptor/provider authority.
 * @param options - Generation and runtime dependencies.
 * @returns Lazy accepted receipt or typed public transport failure.
 */
const resume = Effect.fn("AgentContinuations.resume")(function* (
  input: AgentInput,
  threadId: string,
  operationId: OperationId,
  resolved: ResolvedAgent,
  options: RouteMaterializationOptions,
) {
  if (typeof input.waitingRevision !== "string" || input.waitingRevision.length === 0)
    return yield* resumeError("Agent resume requires the observed waiting revision.");
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
  if (waiting === undefined)
    return yield* lookupAgentContinuation(
      input,
      threadId,
      operationId,
      resolved,
      options,
      requestDigest,
    );
  return yield* admitAgentContinuation(
    input,
    threadId,
    operationId,
    resolved,
    options,
    requestDigest,
    waiting,
  );
});

/** Continuation admission authority captures no per-request authorization during acquisition. */
export class AgentContinuations extends Context.Service<
  AgentContinuations,
  AgentContinuationOperations
>()("@relkit/runtime-hono/AgentContinuations", {
  make: Effect.sync(
    () =>
      ({
        resume: (...args: Parameters<typeof resume>) =>
          observeHttp("agent.resume", resume(...args)),
      }) satisfies AgentContinuationOperations,
  ),
}) {}

/** Builds the concrete continuation service; tests replace the same contract through a Layer. */
export const AgentContinuationsLive = Layer.effect(AgentContinuations, AgentContinuations.make);

/**
 * Runs durable continuation admission at the native oRPC edge.
 * @param input - Submitted operation input; caller already owns request authorization.
 * @param threadId - Authorized durable thread identity.
 * @param operationId - Stable admission/duplicate lookup identity.
 * @param resolved - Fresh descriptor/provider authority.
 * @param options - Owning generation dependencies.
 * @returns Accepted durable receipt, including duplicate status, or original public failure.
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
