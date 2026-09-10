import { forgetPending, pendingOperations } from "./pending.js";
import { procedureCall } from "./procedure.js";

export async function reconcileAgentRun(
  client: unknown,
  scopeKey: string,
  agentId: string,
  signal: AbortSignal,
): Promise<string | undefined> {
  const candidates = pendingOperations(scopeKey).filter(
    (item) =>
      item.resourceId === agentId &&
      (item.kind === "agent-run" || item.kind === "agent-control" || item.kind === "continuation"),
  );
  let restoredThreadId: string | undefined;
  const lookup = procedureCall(client, "relkit.agent.receipt");
  for (const pending of candidates) {
    if (signal.aborted) break;
    const result = (await lookup(
      {
        agentId,
        threadId: pending.threadId,
        runId: pending.runId,
        operationId: pending.operationId,
        kind: pending.kind,
        requestDigest: pending.requestDigest,
      },
      { signal },
    )) as ReceiptLookup;
    if (result.status === "found") {
      forgetPending(scopeKey, pending.operationId);
      restoredThreadId ??= result.receipt.threadId;
    } else if (result.status === "expired") {
      forgetPending(scopeKey, pending.operationId);
    }
  }
  return restoredThreadId;
}

type ReceiptLookup =
  | { readonly status: "found"; readonly receipt: { readonly threadId: string } }
  | { readonly status: "not-found" | "expired" | "state-lost" };
