import { Effect } from "effect";
import { httpBoundary } from "./http-effect.js";
import type { ResolvedAgent } from "./agent-control-worker.types.js";
import { REALTIME_RUNTIME_LIMITS, type OperationId } from "@relkit/contracts";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import { AgentApprovalCoordinator } from "./agent-approval-coordinator.js";
import type { ActiveAgentExecution } from "./agent-active-execution.js";

/** Applies one claimed control and settles its receipt before the next control.
 * @param resolved - Authorized provider and agent scope.
 * @param threadId - Thread containing the controlled run.
 * @param runId - Run whose queued control is selected.
 * @param options - Active generation and runtime dependencies.
 * @param operationId - Idempotency identifier of the control.
 * @param runController - Controller used by a stop control.
 * @param approvals - Run-owned approval coordinator.
 * @param active - Current execution claim, continuation chain and steering buffer.
 * @returns Completion after control settlement or a typed native failure.
 */
export const applyControlEffect = Effect.fn("AgentControls.applyControl")(function* (
  resolved: ResolvedAgent,
  threadId: string,
  runId: string,
  options: RouteMaterializationOptions,
  operationId: OperationId,
  runController: AbortController,
  approvals: AgentApprovalCoordinator,
  active: ActiveAgentExecution,
) {
  const snapshot = yield* httpBoundary("agent.controls.applyControl", () =>
    resolved.provider.loadThread({
      ...resolved.scope,
      threadId,
      maxEncodedBytes: REALTIME_RUNTIME_LIMITS.initialSnapshotBytes,
    }),
  );
  const record = snapshot.controls.find((candidate) => candidate.controlId === operationId);
  if (record === undefined) return;
  if (record.kind === "follow-up") return;
  const claim = yield* httpBoundary("agent.controls.applyControl", () =>
    resolved.provider.claimControl({
      ...resolved.scope,
      threadId,
      runId,
      operationId,
      workerId: crypto.randomUUID(),
      generationId: options.agentRuntime!.generationId,
      expiresAt: new Date(Date.now() + 45_000).toISOString(),
    }),
  );
  const now = new Date().toISOString();
  if (record.kind === "stop") {
    yield* httpBoundary("agent.controls.applyControl", () =>
      resolved.provider.markControlEffectStarted({
        ...resolved.scope,
        threadId,
        runId,
        operationId,
        claim,
      }),
    );
    runController.abort(new Error("Agent stopped."));
    yield* httpBoundary("agent.controls.applyControl", () =>
      resolved.provider.settleControl({
        ...resolved.scope,
        threadId,
        runId,
        operationId,
        claim,
        status: "applied",
        effect: "confirmed",
        settledAt: now,
      }),
    );
    return;
  }
  if (record.kind === "approve") {
    yield* httpBoundary("agent.controls.applyControl", () =>
      approvals.continue(operationId, record.publicPayload, async () => {
        await resolved.provider.markControlEffectStarted({
          ...resolved.scope,
          threadId,
          runId,
          operationId,
          claim,
          downstreamOperationId: operationId,
        });
        await resolved.provider.settleControl({
          ...resolved.scope,
          threadId,
          runId,
          operationId,
          claim,
          status: "applied",
          effect: "confirmed",
          downstreamOperationId: operationId,
          settledAt: now,
        });
      }),
    );
    return;
  }
  if (record.kind === "steer" && typeof record.publicPayload === "string") {
    yield* httpBoundary("agent.controls.applyControl", () =>
      resolved.provider.markControlEffectStarted({
        ...resolved.scope,
        threadId,
        runId,
        operationId,
        claim,
      }),
    );
    active.steering.push(record.publicPayload);
    yield* httpBoundary("agent.controls.applyControl", () =>
      resolved.provider.settleControl({
        ...resolved.scope,
        threadId,
        runId,
        operationId,
        claim,
        status: "applied",
        effect: "confirmed",
        settledAt: now,
      }),
    );
    return;
  }
  yield* httpBoundary("agent.controls.applyControl", () =>
    resolved.provider.settleControl({
      ...resolved.scope,
      threadId,
      runId,
      operationId,
      claim,
      status: "rejected",
      effect: "not-started",
      settledAt: now,
    }),
  );
});
