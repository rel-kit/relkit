import { ORPCError } from "@orpc/client";
import type { ThreadSnapshot } from "relkit/contracts";
import { abortable } from "../native/iterate.js";
import { observeAgent } from "./agent-observe.js";
import { pendingOperations } from "./pending.service.js";
import type { PendingOperationService } from "./pending.types.js";
import { procedureCall } from "./procedure.js";
import type {
  AgentOperationsService,
  AgentReceiptLookup,
  AgentSubmission,
  PreparedContinuation,
} from "./agent-operations.types.js";

/**
 * Creates agent operations over a pending receipt authority.
 * @param pending - Pending receipt bookkeeping shared with the rest of the client.
 * @returns Resource-free operations; each observation owns its own requests.
 * @example
 * ```ts
 * import { createAgentOperations } from "./agent-operations.service.js";
 * import { pendingOperations } from "./pending.service.js";
 * type Client = Parameters<ReturnType<typeof createAgentOperations>["reconcile"]>[0];
 * export async function reconcile(client: Client, scopeKey: string, signal: AbortSignal) {
 *   const operations = createAgentOperations(pendingOperations);
 *   await operations.reconcile(client, scopeKey, "support.echo", signal);
 * }
 * ```
 */
export function createAgentOperations(pending: PendingOperationService): AgentOperationsService {
  const continuation = async (
    client: unknown,
    agentId: string,
    threadId: string,
    payload: unknown,
    current?: ThreadSnapshot,
    signal?: AbortSignal,
  ): Promise<PreparedContinuation> => {
    const snapshot =
      current?.thread.threadId === threadId && current.waiting !== undefined
        ? current
        : ((await abortable(
            Promise.resolve().then(() =>
              procedureCall(client, "relkit.agent.load")(
                { agentId, threadId },
                { signal: signal ?? new AbortController().signal },
              ),
            ),
            signal,
          )) as ThreadSnapshot);
    if (snapshot.waiting === undefined) throw new Error("Graph has no waiting continuation.");
    const waitingRevision = snapshot.waiting.revision;
    return { waitingRevision, digestValue: { payload, waitingRevision } };
  };

  const reconcile = async (
    client: unknown,
    scopeKey: string,
    agentId: string,
    signal: AbortSignal,
  ): Promise<string | undefined> => {
    const candidates = pending
      .list(scopeKey)
      .filter(
        (item) =>
          item.resourceId === agentId &&
          (item.kind === "agent-run" ||
            item.kind === "agent-control" ||
            item.kind === "continuation"),
      );
    let restoredThreadId: string | undefined;
    for (const candidate of candidates) {
      if (signal.aborted) break;
      const result = (await abortable(
        Promise.resolve().then(() =>
          procedureCall(client, "relkit.agent.receipt")(
            {
              agentId,
              threadId: candidate.threadId,
              runId: candidate.runId,
              operationId: candidate.operationId,
              kind: candidate.kind,
              requestDigest: candidate.requestDigest,
            },
            { signal },
          ),
        ),
        signal,
      )) as AgentReceiptLookup;
      if (result.status === "found") {
        pending.forget(scopeKey, candidate.operationId);
        restoredThreadId ??= result.receipt.threadId;
      } else if (result.status === "expired") pending.forget(scopeKey, candidate.operationId);
    }
    return restoredThreadId;
  };

  const submit = async (request: AgentSubmission): Promise<unknown> => {
    const prepared =
      request.resume === true
        ? await continuation(
            request.client,
            request.agentId,
            request.threadId,
            request.payload,
            request.snapshot,
          )
        : undefined;
    const entry = await pending.remember(
      request.scopeKey,
      prepared === undefined
        ? request.kind === "run"
          ? "agent-run"
          : "agent-control"
        : "continuation",
      request.agentId,
      prepared?.digestValue ?? request.payload,
      {
        threadId: request.threadId,
        ...(request.activeRunId === undefined ? {} : { runId: request.activeRunId }),
      },
      {},
    );
    try {
      // Accepted server work belongs to this submission, independent of view cleanup.
      const receipt = await procedureCall(
        request.client,
        request.kind === "run" ? "relkit.agent.run" : "relkit.agent.control",
      )({
        agentId: request.agentId,
        expectedIdentity: request.identity,
        threadId: request.threadId,
        kind: request.kind,
        payload: request.payload,
        ...(request.resume === true ? { resume: true } : {}),
        ...(prepared === undefined ? {} : { waitingRevision: prepared.waitingRevision }),
        operationId: entry.operationId,
        requestDigest: entry.requestDigest,
      });
      pending.update(request.scopeKey, { ...entry, state: "accepted" });
      if (
        request.kind === "run" &&
        isAcceptedAgentRun(receipt) &&
        receipt.threadId !== request.threadId
      )
        throw new Error("RelKit returned a different thread ID than the caller supplied.");
      if (receipt !== undefined) pending.forget(request.scopeKey, entry.operationId);
      return receipt;
    } catch (error) {
      if (error instanceof ORPCError) pending.forget(request.scopeKey, entry.operationId);
      else pending.update(request.scopeKey, { ...entry, state: "unknown" });
      throw error;
    }
  };

  return { observe: observeAgent, continuation, reconcile, submit };
}

/** The browser's agent operations, backed by the shared pending receipt authority. */
export const agentOperations: AgentOperationsService = createAgentOperations(pendingOperations);

/**
 * Retains the existing weak receipt predicate used by agent dispatch.
 * @param value - Native receipt payload.
 * @returns Whether it carries a thread identity.
 */
export function isAcceptedAgentRun(value: unknown): value is { readonly threadId: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { threadId?: unknown }).threadId === "string"
  );
}
