import { ORPCError } from "@orpc/client";
import type { AgentObservation, ThreadSnapshot } from "relkit/contracts";
import { abortable, delay, iterateNative } from "../native/iterate.js";
import { applyAgentEvent } from "./agent-observation.js";
import { applyAgentSnapshot } from "./agent-snapshot-observation.js";
import { procedureCall } from "./procedure.js";
import type {
  AgentIdentity,
  AgentObservationCursor,
  AgentUpdate,
} from "./agent-operations.types.js";

/**
 * Restores the authoritative snapshot and owns every subsequent observation attempt.
 * Transport failures reconnect from the last cursor with backoff (50 ms doubling to 1 s);
 * an RPC error or a failed restore is published as error state.
 * @typeParam Output - Declared agent output.
 * @param client - Finite procedure client.
 * @param streamClient - Observation procedure client.
 * @param agentId - Declared agent identity.
 * @param threadId - Caller-owned thread identity.
 * @param identity - Expected application identity authority.
 * @param signal - Borrowed view cancellation signal.
 * @param update - Borrowed state publication callback.
 * @returns Completion after terminal evidence, cancellation, or a published failure.
 */
export async function observeAgent<Output>(
  client: unknown,
  streamClient: unknown,
  agentId: string,
  threadId: string,
  identity: AgentIdentity | undefined,
  signal: AbortSignal,
  update: AgentUpdate<Output>,
): Promise<void> {
  try {
    const snapshot = (await abortable(
      Promise.resolve().then(() =>
        procedureCall(client, "relkit.agent.load")({ agentId, threadId }, { signal }),
      ),
      signal,
    )) as ThreadSnapshot;
    const cursor: AgentObservationCursor = {
      checkpoint: snapshot.checkpoint,
      runId: snapshotRunId(snapshot),
    };
    update((current) => applyAgentSnapshot(current, snapshot));
    let retryMs = 50;
    while (!signal.aborted) {
      let failed = false;
      let terminal = false;
      try {
        terminal = await observeAttempt(
          streamClient,
          agentId,
          threadId,
          identity,
          signal,
          cursor,
          update,
        );
      } catch (error) {
        if (signal.aborted) return;
        failed = true;
        if (error instanceof ORPCError) throw error;
      }
      if (terminal || signal.aborted) return;
      if (!failed) retryMs = 50;
      await delay(retryMs, signal);
      retryMs = Math.min(retryMs * 2, 1_000);
    }
  } catch (error) {
    if (!signal.aborted) update((current) => ({ ...current, status: "error", error }));
  }
}

/**
 * Pulls a single owned stream through EOF or an authoritative terminal event.
 * @typeParam Output - Declared output state.
 * @param client - Stream procedure client.
 * @param agentId - Declared agent.
 * @param threadId - Caller thread.
 * @param identity - Full expected identity.
 * @param signal - Borrowed cancellation authority.
 * @param cursor - Observation-owned checkpoint and run state.
 * @param update - Borrowed publication callback.
 * @returns Whether an authoritative run-finished event ended this attempt.
 */
async function observeAttempt<Output>(
  client: unknown,
  agentId: string,
  threadId: string,
  identity: AgentIdentity | undefined,
  signal: AbortSignal,
  cursor: AgentObservationCursor,
  update: AgentUpdate<Output>,
): Promise<boolean> {
  const frames = iterateNative<AgentObservation>(
    async (owned) => {
      const stream = (await procedureCall(client, "relkit.agent.observe")(
        {
          agentId,
          threadId,
          after: cursor.checkpoint,
          ...(cursor.runId === undefined ? {} : { runId: cursor.runId }),
          ...(identity === undefined ? {} : { expectedIdentity: identity }),
        },
        { signal: owned },
      )) as AsyncIterable<AgentObservation>;
      return stream[Symbol.asyncIterator]();
    },
    { signal, read: (iterator, owned) => abortable(iterator.next(), owned) },
  );
  for await (const next of frames) {
    if (signal.aborted) return false;
    if (next.kind === "event") {
      cursor.checkpoint = next.event.checkpoint;
      cursor.runId = next.event.runId;
      update((current) => applyAgentEvent(current, next.event));
      if (next.event.kind === "run-finished") return true;
    } else {
      cursor.checkpoint = next.snapshot.checkpoint;
      cursor.runId = snapshotRunId(next.snapshot) ?? cursor.runId;
      update((current) => applyAgentSnapshot(current, next.snapshot));
    }
  }
  return false;
}

/**
 * Selects the existing active or most recently accepted run without changing authority.
 * @param snapshot - Authoritative snapshot.
 * @returns Its active/latest run identity.
 */
function snapshotRunId(snapshot: ThreadSnapshot): string | undefined {
  if (snapshot.activeRun !== undefined) return snapshot.activeRun.runId;
  return [...snapshot.currentRuns].sort((left, right) =>
    right.acceptedAt.localeCompare(left.acceptedAt),
  )[0]?.runId;
}
