import { REALTIME_RUNTIME_LIMITS } from "@relkit/contracts";
import type { ActiveAgentExecution } from "./agent-active-execution.js";
import type { agentContext } from "./agent-rpc-support.js";
import { agentLimits, agentOwner, digest, validateAgentInput } from "./agent-rpc-support.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";

type ResolvedAgent = Awaited<ReturnType<typeof agentContext>>;

export interface NextAgentRun {
  readonly receipt: Awaited<ReturnType<ResolvedAgent["provider"]["acceptRun"]>>;
  readonly input: unknown;
  readonly controlRunIds: readonly string[];
}

export async function processAgentFollowUps(
  resolved: ResolvedAgent,
  active: ActiveAgentExecution,
  options: RouteMaterializationOptions,
  startNext: boolean,
): Promise<NextAgentRun | undefined> {
  const snapshot = await resolved.provider.loadThread({
    ...resolved.scope,
    threadId: active.receipt.threadId,
    maxEncodedBytes: REALTIME_RUNTIME_LIMITS.initialSnapshotBytes,
  });
  const queued = snapshot.controls
    .filter(
      (record) =>
        record.kind === "follow-up" &&
        record.status === "accepted" &&
        active.controlRunIds.includes(record.runId),
    )
    .sort((left, right) => left.acceptedAt.localeCompare(right.acceptedAt));
  if (!startNext) {
    await Promise.all(
      queued.map((record) =>
        cancel(resolved, active.receipt.threadId, options.agentRuntime!.generationId, record),
      ),
    );
    return undefined;
  }
  for (const record of queued) {
    const claim = await resolved.provider.claimControl({
      ...resolved.scope,
      threadId: active.receipt.threadId,
      runId: record.runId,
      operationId: record.controlId,
      workerId: crypto.randomUUID(),
      generationId: options.agentRuntime!.generationId,
      expiresAt: new Date(Date.now() + REALTIME_RUNTIME_LIMITS.leaseExpiryMs).toISOString(),
    });
    let input: unknown;
    try {
      input = await validateAgentInput(resolved, record.publicPayload);
    } catch {
      await resolved.provider.settleControl({
        ...resolved.scope,
        threadId: active.receipt.threadId,
        runId: record.runId,
        operationId: record.controlId,
        claim,
        status: "rejected",
        effect: "not-started",
        settledAt: new Date().toISOString(),
      });
      continue;
    }
    await resolved.provider.markControlEffectStarted({
      ...resolved.scope,
      threadId: active.receipt.threadId,
      runId: record.runId,
      operationId: record.controlId,
      claim,
      downstreamOperationId: record.controlId,
    });
    const now = new Date().toISOString();
    const receipt = await resolved.provider.acceptRun({
      ...resolved.scope,
      operationId: record.controlId,
      semanticDigest: digest(record.publicPayload),
      threadId: active.receipt.threadId,
      owner: agentOwner(options, resolved.scope.profile),
      input,
      inputDigest: digest(input),
      acceptedAt: now,
      receiptExpiresAt: new Date(Date.now() + REALTIME_RUNTIME_LIMITS.agentReceiptMs).toISOString(),
      limits: agentLimits,
    });
    await resolved.provider.settleControl({
      ...resolved.scope,
      threadId: active.receipt.threadId,
      runId: record.runId,
      operationId: record.controlId,
      claim,
      status: "applied",
      effect: "confirmed",
      downstreamOperationId: record.controlId,
      settledAt: now,
    });
    return {
      receipt,
      input,
      controlRunIds: [...active.controlRunIds, receipt.runId],
    };
  }
  return undefined;
}

async function cancel(
  resolved: ResolvedAgent,
  threadId: string,
  generationId: string,
  record: Awaited<ReturnType<ResolvedAgent["provider"]["loadThread"]>>["controls"][number],
): Promise<void> {
  const claim = await resolved.provider.claimControl({
    ...resolved.scope,
    threadId,
    runId: record.runId,
    operationId: record.controlId,
    workerId: crypto.randomUUID(),
    generationId,
    expiresAt: new Date(Date.now() + REALTIME_RUNTIME_LIMITS.leaseExpiryMs).toISOString(),
  });
  await resolved.provider.settleControl({
    ...resolved.scope,
    threadId,
    runId: record.runId,
    operationId: record.controlId,
    claim,
    status: "cancelled",
    effect: "not-started",
    settledAt: new Date().toISOString(),
  });
}
