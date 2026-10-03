import { Context, Effect, Layer, Result } from "effect";
import { httpBoundary, observeHttp, runHttp } from "./http-effect.js";
import type { ResolvedAgent, NextAgentRun } from "./agent-follow-up.types.js";
export type { NextAgentRun } from "./agent-follow-up.types.js";
import { REALTIME_RUNTIME_LIMITS } from "@relkit/contracts";
import type { ActiveAgentExecution } from "./agent-active-execution.js";

import { agentLimits, agentOwner, digest, validateAgentInput } from "./agent-rpc-support.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";

/** Settles queued follow-ups and admits at most one next run in order.
 * @param resolved - Authorized agent descriptor, provider and durable request scope.
 * @param active - Mutable state owned by the accepted run and its continuation chain.
 * @param options - Application dependencies and configuration for this domain.
 * @param startNext - Whether successful settlement permits admitting a queued follow-up.
 * @returns The next admitted run, or undefined when no queued continuation can start.
 */
const processAgentFollowUpsEffect = Effect.fn("AgentFollowUps.processAgentFollowUps")(function* (
  resolved: ResolvedAgent,
  active: ActiveAgentExecution,
  options: RouteMaterializationOptions,
  startNext: boolean,
) {
  const snapshot = yield* httpBoundary("agent.followUp.processAgentFollowUps", () =>
    resolved.provider.loadThread({
      ...resolved.scope,
      threadId: active.receipt.threadId,
      maxEncodedBytes: REALTIME_RUNTIME_LIMITS.initialSnapshotBytes,
    }),
  );
  const queued = snapshot.controls
    .filter(
      (record) =>
        record.kind === "follow-up" &&
        record.status === "accepted" &&
        active.controlRunIds.includes(record.runId),
    )
    .sort((left, right) => left.acceptedAt.localeCompare(right.acceptedAt));
  if (!startNext) {
    yield* Effect.forEach(
      queued,
      (record) =>
        cancelEffect(resolved, active.receipt.threadId, options.agentRuntime!.generationId, record),
      { concurrency: 8, discard: true },
    );
    return undefined;
  }
  for (const record of queued) {
    const claim = yield* httpBoundary("agent.followUp.processAgentFollowUps", () =>
      resolved.provider.claimControl({
        ...resolved.scope,
        threadId: active.receipt.threadId,
        runId: record.runId,
        operationId: record.controlId,
        workerId: crypto.randomUUID(),
        generationId: options.agentRuntime!.generationId,
        expiresAt: new Date(Date.now() + REALTIME_RUNTIME_LIMITS.leaseExpiryMs).toISOString(),
      }),
    );
    const validation = yield* Effect.result(
      httpBoundary("agent.followUp.validate", () =>
        validateAgentInput(resolved, record.publicPayload),
      ),
    );
    if (Result.isFailure(validation)) {
      yield* httpBoundary("agent.followUp.processAgentFollowUps", () =>
        resolved.provider.settleControl({
          ...resolved.scope,
          threadId: active.receipt.threadId,
          runId: record.runId,
          operationId: record.controlId,
          claim,
          status: "rejected",
          effect: "not-started",
          settledAt: new Date().toISOString(),
        }),
      );
      continue;
    }
    const input = validation.success;
    yield* httpBoundary("agent.followUp.processAgentFollowUps", () =>
      resolved.provider.markControlEffectStarted({
        ...resolved.scope,
        threadId: active.receipt.threadId,
        runId: record.runId,
        operationId: record.controlId,
        claim,
        downstreamOperationId: record.controlId,
      }),
    );
    const now = new Date().toISOString();
    const receipt = yield* httpBoundary("agent.followUp.processAgentFollowUps", () =>
      resolved.provider.acceptRun({
        ...resolved.scope,
        operationId: record.controlId,
        semanticDigest: digest(record.publicPayload),
        threadId: active.receipt.threadId,
        owner: agentOwner(options, resolved.scope.profile),
        input,
        inputDigest: digest(input),
        acceptedAt: now,
        receiptExpiresAt: new Date(
          Date.now() + REALTIME_RUNTIME_LIMITS.agentReceiptMs,
        ).toISOString(),
        limits: agentLimits,
      }),
    );
    yield* httpBoundary("agent.followUp.processAgentFollowUps", () =>
      resolved.provider.settleControl({
        ...resolved.scope,
        threadId: active.receipt.threadId,
        runId: record.runId,
        operationId: record.controlId,
        claim,
        status: "applied",
        effect: "confirmed",
        downstreamOperationId: record.controlId,
        settledAt: now,
      }),
    );
    return {
      receipt,
      input,
      controlRunIds: [...active.controlRunIds, receipt.runId],
    };
  }
  return undefined;
});

/** Cancels queued follow-ups after their owning run cannot continue.
 * @param resolved - Authorized agent descriptor, provider and durable request scope.
 * @param threadId - Stable thread identifier within the authorized agent scope.
 * @param generationId - generation id supplied by the caller.
 * @param record - Durable record projected or settled by this operation.
 * @returns Completion after every queued follow-up is cancelled with bounded concurrency.
 */
const cancelEffect = Effect.fn("AgentFollowUps.cancel")(function* (
  resolved: ResolvedAgent,
  threadId: string,
  generationId: string,
  record: Awaited<ReturnType<ResolvedAgent["provider"]["loadThread"]>>["controls"][number],
) {
  const claim = yield* httpBoundary("agent.followUp.cancel", () =>
    resolved.provider.claimControl({
      ...resolved.scope,
      threadId,
      runId: record.runId,
      operationId: record.controlId,
      workerId: crypto.randomUUID(),
      generationId,
      expiresAt: new Date(Date.now() + REALTIME_RUNTIME_LIMITS.leaseExpiryMs).toISOString(),
    }),
  );
  yield* httpBoundary("agent.followUp.cancel", () =>
    resolved.provider.settleControl({
      ...resolved.scope,
      threadId,
      runId: record.runId,
      operationId: record.controlId,
      claim,
      status: "cancelled",
      effect: "not-started",
      settledAt: new Date().toISOString(),
    }),
  );
});

/** Sequential continuation admission; cancellation uses a bounded traversal. */
export class AgentFollowUps extends Context.Service<
  AgentFollowUps,
  { readonly process: typeof processAgentFollowUpsEffect }
>()("@relkit/runtime-hono/AgentFollowUps") {}

/** Live durable follow-up workflow. */
export const AgentFollowUpsLive = Layer.succeed(AgentFollowUps, {
  process: (...args) => observeHttp("agent.followUp.process", processAgentFollowUpsEffect(...args)),
});

/** Settles queued controls and admits at most one next run.
 * @param resolved - Authorized agent descriptor, provider and durable request scope.
 * @param active - Mutable state owned by the accepted run and its continuation chain.
 * @param options - Application dependencies and configuration for this domain.
 * @param startNext - Whether successful settlement permits admitting a queued follow-up.
 * @returns The next admitted run, or undefined when no continuation may start.
 */
export function processAgentFollowUps(
  resolved: ResolvedAgent,
  active: ActiveAgentExecution,
  options: RouteMaterializationOptions,
  startNext: boolean,
): Promise<NextAgentRun | undefined> {
  return runHttp(
    Effect.gen(function* () {
      const service = yield* AgentFollowUps;
      return yield* service.process(resolved, active, options, startNext);
    }).pipe(Effect.provide(AgentFollowUpsLive)),
  );
}
