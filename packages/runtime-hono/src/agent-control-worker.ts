import { REALTIME_RUNTIME_LIMITS, type OperationId } from "@relkit/contracts";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import type { agentContext } from "./agent-rpc-support.js";
import { AgentApprovalCoordinator } from "./agent-approval-coordinator.js";
import type { ActiveAgentExecution } from "./agent-active-execution.js";

type ResolvedAgent = Awaited<ReturnType<typeof agentContext>>;

export async function consumeAgentControls(
  resolved: ResolvedAgent,
  active: ActiveAgentExecution,
  options: RouteMaterializationOptions,
  runController: AbortController,
  approvals: AgentApprovalCoordinator,
  signal: AbortSignal,
): Promise<void> {
  let afterSequence: string | undefined;
  let runId = active.receipt.runId;
  while (!signal.aborted) {
    if (runId !== active.receipt.runId) {
      runId = active.receipt.runId;
      afterSequence = undefined;
    }
    const page = await resolved.provider.readControls({
      ...resolved.scope,
      threadId: active.receipt.threadId,
      runId,
      ...(afterSequence === undefined ? {} : { afterSequence }),
      limit: 32,
    });
    for (const operationId of page.operationIds) {
      await applyControl(
        resolved,
        active.receipt.threadId,
        runId,
        options,
        operationId,
        runController,
        approvals,
        active,
      ).catch(() => undefined);
    }
    afterSequence = page.nextSequence;
    if (!page.hasMore)
      await resolved.provider.waitForControls({
        ...resolved.scope,
        threadId: active.receipt.threadId,
        runId,
        afterSequence: page.nextSequence,
        deadlineMs: Date.now() + 15_000,
        signal,
      });
  }
}

async function applyControl(
  resolved: ResolvedAgent,
  threadId: string,
  runId: string,
  options: RouteMaterializationOptions,
  operationId: OperationId,
  runController: AbortController,
  approvals: AgentApprovalCoordinator,
  active: ActiveAgentExecution,
) {
  const snapshot = await resolved.provider.loadThread({
    ...resolved.scope,
    threadId,
    maxEncodedBytes: REALTIME_RUNTIME_LIMITS.initialSnapshotBytes,
  });
  const record = snapshot.controls.find((candidate) => candidate.controlId === operationId);
  if (record === undefined) return;
  if (record.kind === "follow-up") return;
  const claim = await resolved.provider.claimControl({
    ...resolved.scope,
    threadId,
    runId,
    operationId,
    workerId: crypto.randomUUID(),
    generationId: options.agentRuntime!.generationId,
    expiresAt: new Date(Date.now() + 45_000).toISOString(),
  });
  const now = new Date().toISOString();
  if (record.kind === "stop") {
    await resolved.provider.markControlEffectStarted({
      ...resolved.scope,
      threadId,
      runId,
      operationId,
      claim,
    });
    runController.abort(new Error("Agent stopped."));
    await resolved.provider.settleControl({
      ...resolved.scope,
      threadId,
      runId,
      operationId,
      claim,
      status: "applied",
      effect: "confirmed",
      settledAt: now,
    });
    return;
  }
  if (record.kind === "approve") {
    await approvals.continue(operationId, record.publicPayload, async () => {
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
    });
    return;
  }
  if (record.kind === "steer" && typeof record.publicPayload === "string") {
    await resolved.provider.markControlEffectStarted({
      ...resolved.scope,
      threadId,
      runId,
      operationId,
      claim,
    });
    active.steering.push(record.publicPayload);
    await resolved.provider.settleControl({
      ...resolved.scope,
      threadId,
      runId,
      operationId,
      claim,
      status: "applied",
      effect: "confirmed",
      settledAt: now,
    });
    return;
  }
  await resolved.provider.settleControl({
    ...resolved.scope,
    threadId,
    runId,
    operationId,
    claim,
    status: "rejected",
    effect: "not-started",
    settledAt: now,
  });
}
