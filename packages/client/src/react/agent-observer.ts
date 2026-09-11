import type { AgentObservation, JournalCheckpoint, ThreadSnapshot } from "@relkit/contracts";
import { ORPCError } from "../index.js";
import { applyAgentEvent } from "./agent-observation.js";
import { applyAgentSnapshot } from "./agent-snapshot-observation.js";
import { procedureCall } from "./procedure.js";
import type { AgentBase } from "./agent-hook-types.js";

type Update<Output> = (
  value: AgentBase<Output> | ((current: AgentBase<Output>) => AgentBase<Output>),
) => void;

export async function restoreAndObserve<Output>(
  client: unknown,
  streamClient: unknown,
  agentId: string,
  threadId: string,
  identity: { readonly identityScope: string; readonly sessionEpoch: string } | undefined,
  signal: AbortSignal,
  update: Update<Output>,
): Promise<void> {
  try {
    const load = procedureCall(client, "relkit.agent.load");
    const snapshot = (await load({ agentId, threadId }, { signal })) as ThreadSnapshot;
    const cursor = { value: snapshot.checkpoint };
    const run = { value: snapshotRunId(snapshot) };
    update((current) => applyAgentSnapshot(current, snapshot));
    let retryMs = 50;
    while (!signal.aborted) {
      try {
        const terminal = await observeOnce(
          streamClient,
          agentId,
          threadId,
          identity,
          cursor,
          run,
          signal,
          update,
        );
        if (terminal) return;
        retryMs = 50;
      } catch (error) {
        if (signal.aborted) return;
        if (error instanceof ORPCError) throw error;
      }
      if (signal.aborted) return;
      await retryDelay(retryMs, signal);
      retryMs = Math.min(retryMs * 2, 1_000);
    }
  } catch (error) {
    if (!signal.aborted) update((current) => ({ ...current, status: "error", error }));
  }
}

async function observeOnce<Output>(
  streamClient: unknown,
  agentId: string,
  threadId: string,
  identity: { readonly identityScope: string; readonly sessionEpoch: string } | undefined,
  cursor: { value: JournalCheckpoint },
  run: { value: string | undefined },
  signal: AbortSignal,
  update: Update<Output>,
): Promise<boolean> {
  const observe = procedureCall(streamClient, "relkit.agent.observe");
  const stream = (await observe(
    {
      agentId,
      threadId,
      after: cursor.value,
      ...(run.value === undefined ? {} : { runId: run.value }),
      ...(identity === undefined ? {} : { expectedIdentity: identity }),
    },
    { signal },
  )) as AsyncIterable<AgentObservation>;
  for await (const next of stream) {
    if (next.kind === "event") {
      cursor.value = next.event.checkpoint;
      run.value = next.event.runId;
      update((current) => applyAgentEvent(current, next.event));
      if (next.event.kind === "run-finished") return true;
    } else {
      cursor.value = next.snapshot.checkpoint;
      run.value = snapshotRunId(next.snapshot) ?? run.value;
      update((current) => applyAgentSnapshot(current, next.snapshot));
    }
  }
  return false;
}

function snapshotRunId(snapshot: ThreadSnapshot): string | undefined {
  if (snapshot.activeRun !== undefined) return snapshot.activeRun.runId;
  return [...snapshot.currentRuns].sort((left, right) =>
    right.acceptedAt.localeCompare(left.acceptedAt),
  )[0]?.runId;
}

function retryDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    function abort() {
      clearTimeout(timer);
      reject(signal.reason);
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}
