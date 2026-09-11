import { REALTIME_RUNTIME_LIMITS } from "@relkit/contracts";
import { agentClientEvents } from "@relkit/agents";
import { assertExpectedIdentity } from "./rpc-identity.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import type { RpcContext } from "./rpc.js";
import { agentContext, requireAgentThreadId, type AgentInput } from "./agent-rpc-support.js";
import { clientAgentSnapshot } from "./agent-compatibility.js";

export async function listAgentThreads(
  input: AgentInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
) {
  await assertExpectedIdentity(context, options.clientIdentity!, input.expectedIdentity);
  const resolved = await agentContext(input, context, options, "list");
  return resolved.provider.listThreads({ ...resolved.scope, limit: 100 });
}

export async function loadAgent(
  input: AgentInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
) {
  await assertExpectedIdentity(context, options.clientIdentity!);
  const threadId = requireAgentThreadId(input.threadId);
  const resolved = await agentContext({ ...input, threadId }, context, options, "load");
  return clientAgentSnapshot(
    await resolved.provider.loadThread({
      ...resolved.scope,
      threadId,
      maxEncodedBytes: REALTIME_RUNTIME_LIMITS.initialSnapshotBytes,
    }),
  );
}

export async function* observeAgent(
  input: AgentInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
  signal?: AbortSignal,
) {
  await assertExpectedIdentity(context, options.clientIdentity!, input.expectedIdentity);
  const threadId = requireAgentThreadId(input.threadId);
  if (input.after === undefined) throw new TypeError("checkpoint is required.");
  let resolved = await agentContext({ ...input, threadId }, context, options, "observe");
  let after = input.after as Parameters<typeof resolved.provider.readJournal>[0]["after"];
  const controller = signal ?? new AbortController().signal;
  while (!controller.aborted) {
    await assertExpectedIdentity(context, options.clientIdentity!, input.expectedIdentity);
    resolved = await agentContext({ ...input, threadId }, context, options, "observe");
    const page = await resolved.provider.readJournal({
      ...resolved.scope,
      threadId,
      after,
      limit: 100,
      maxEncodedBytes: 1024 * 1024,
    });
    if (page.gap !== undefined) {
      const snapshot = clientAgentSnapshot(
        await resolved.provider.loadThread({
          ...resolved.scope,
          threadId,
          maxEncodedBytes: REALTIME_RUNTIME_LIMITS.initialSnapshotBytes,
        }),
      );
      after = snapshot.checkpoint;
      yield { kind: "gap" as const, reason: page.gap, snapshot };
      continue;
    }
    after = page.checkpoint;
    for (const record of page.records)
      for (const event of agentClientEvents(record)) yield { kind: "event" as const, event };
    if (page.records.some(requiresSnapshot)) {
      const snapshot = clientAgentSnapshot(
        await resolved.provider.loadThread({
          ...resolved.scope,
          threadId,
          maxEncodedBytes: REALTIME_RUNTIME_LIMITS.initialSnapshotBytes,
        }),
      );
      yield { kind: "snapshot" as const, snapshot };
    }
    if (!page.hasMore)
      await resolved.provider.waitForJournal({
        ...resolved.scope,
        threadId,
        after,
        deadlineMs: Date.now() + 15_000,
        signal: controller,
      });
  }
}

function requiresSnapshot(record: { readonly kind: string }): boolean {
  return (
    record.kind === "approval" ||
    record.kind === "control" ||
    record.kind === "terminal" ||
    record.kind === "interruption"
  );
}

export async function lookupAgentReceipt(
  input: AgentInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
) {
  await assertExpectedIdentity(context, options.clientIdentity!);
  if (input.operationId === undefined || input.requestDigest === undefined)
    throw new TypeError("Receipt request is invalid.");
  const resolved = await agentContext(input, context, options, "receipt");
  if (input.kind === "continuation") {
    const threadId = requireAgentThreadId(input.threadId);
    return resolved.provider.lookupContinuationReceipt({
      ...resolved.scope,
      operationId: input.operationId,
      threadId,
      semanticDigest: input.requestDigest,
      now: new Date().toISOString(),
    });
  }
  if (input.kind === "agent-control") {
    const threadId = requireAgentThreadId(input.threadId);
    if (input.runId === undefined) throw new TypeError("Control receipt request is invalid.");
    return resolved.provider.lookupControlReceipt({
      ...resolved.scope,
      operationId: input.operationId,
      threadId,
      runId: input.runId,
      semanticDigest: input.requestDigest,
      now: new Date().toISOString(),
    });
  }
  return resolved.provider.lookupRunReceipt({
    ...resolved.scope,
    operationId: input.operationId,
    ...(input.threadId === undefined ? {} : { threadId: input.threadId }),
    semanticDigest: input.requestDigest,
    now: new Date().toISOString(),
  });
}

export async function readAgentHistory(
  input: AgentInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
) {
  await assertExpectedIdentity(context, options.clientIdentity!);
  const threadId = requireAgentThreadId(input.threadId);
  if (input.snapshotId === undefined || input.cursor === undefined)
    throw new TypeError("Snapshot and cursor are required.");
  const resolved = await agentContext({ ...input, threadId }, context, options, "history");
  return resolved.provider.readSnapshotHistory({
    ...resolved.scope,
    threadId,
    snapshotId: input.snapshotId,
    cursor: input.cursor,
    maxEncodedBytes: REALTIME_RUNTIME_LIMITS.snapshotHistoryPageBytes,
  });
}
