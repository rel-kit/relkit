import { ORPCError } from "@orpc/client";
import type { AgentObservation, ThreadSnapshot } from "@relkit/contracts";
import { observeExecution } from "@relkit/contracts/operation";
import { Effect, Stream } from "effect";
import { nativeCall, nativeStream } from "../native-stream.js";
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
 * @typeParam Output - Declared agent output.
 * @param client - Finite procedure client.
 * @param streamClient - Observation procedure client.
 * @param agentId - Declared agent identity.
 * @param threadId - Caller-owned thread identity.
 * @param identity - Expected application identity authority.
 * @param signal - Borrowed view cancellation signal.
 * @param update - Borrowed state publication callback.
 * @returns Lazy recovery work; fatal failures publish the original object.
 */
export const observeAgent = Effect.fn("AgentOperations.observe")(
  <Output>(
    client: unknown,
    streamClient: unknown,
    agentId: string,
    threadId: string,
    identity: AgentIdentity | undefined,
    signal: AbortSignal,
    update: AgentUpdate<Output>,
  ): Effect.Effect<void, unknown> =>
    observeExecution(
      "client",
      "agent.observe",
      Effect.gen(function* () {
        const snapshot = (yield* nativeCall(async (owned) =>
          procedureCall(client, "relkit.agent.load")(
            { agentId, threadId },
            { signal: AbortSignal.any([signal, owned]) },
          ),
        )) as ThreadSnapshot;
        const cursor: AgentObservationCursor = {
          checkpoint: snapshot.checkpoint,
          runId: snapshotRunId(snapshot),
        };
        update((current) => applyAgentSnapshot(current, snapshot));
        let retryMs = 50;
        while (!signal.aborted) {
          let failed = false;
          const terminal = yield* observeAttempt(
            streamClient,
            agentId,
            threadId,
            identity,
            signal,
            cursor,
            update,
          ).pipe(
            Effect.catch((error) => {
              if (signal.aborted) return Effect.interrupt;
              failed = true;
              return error instanceof ORPCError ? Effect.fail(error) : Effect.succeed(false);
            }),
          );
          if (terminal || signal.aborted) return;
          if (!failed) retryMs = 50;
          yield* Effect.sleep(retryMs);
          retryMs = Math.min(retryMs * 2, 1_000);
        }
      }),
    ).pipe(
      Effect.catch((error) =>
        Effect.sync(() => {
          if (!signal.aborted) update((current) => ({ ...current, status: "error", error }));
        }),
      ),
    ),
);

/**
 * Pulls a single owned stream through EOF or an authoritative terminal event.
 * @typeParam Output - Declared output state.
 * @param client - Stream procedure client.
 * @param agentId - Declared agent.
 * @param threadId - Caller thread.
 * @param identity - Full expected identity.
 * @param signal - Borrowed cancellation authority.
 * @param cursor - Fiber-owned checkpoint and run state.
 * @param update - Borrowed publication callback.
 * @returns Whether an authoritative run-finished event ended this attempt.
 */
function observeAttempt<Output>(
  client: unknown,
  agentId: string,
  threadId: string,
  identity: AgentIdentity | undefined,
  signal: AbortSignal,
  cursor: AgentObservationCursor,
  update: AgentUpdate<Output>,
): Effect.Effect<boolean, unknown> {
  return Effect.gen(function* () {
    let terminal = false;
    const source = nativeStream<AgentObservation>(
      "agent.observe.frames",
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
      signal,
    );
    yield* source.pipe(
      Stream.mapEffect((next) =>
        Effect.sync(() => {
          if (signal.aborted) return false;
          if (next.kind === "event") {
            cursor.checkpoint = next.event.checkpoint;
            cursor.runId = next.event.runId;
            update((current) => applyAgentEvent(current, next.event));
            terminal = next.event.kind === "run-finished";
          } else {
            cursor.checkpoint = next.snapshot.checkpoint;
            cursor.runId = snapshotRunId(next.snapshot) ?? cursor.runId;
            update((current) => applyAgentSnapshot(current, next.snapshot));
          }
          return !terminal;
        }),
      ),
      Stream.takeWhile(Boolean),
      Stream.runDrain,
    );
    return terminal;
  });
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
