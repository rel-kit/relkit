import type { AgentProtocolFrame, AgentProtocolEmission } from "./agent-protocol-stream.types.js";
export type { AgentProtocolFrame, AgentProtocolEmission } from "./agent-protocol-stream.types.js";
import type { AgentObservation, JournalCheckpoint } from "@relkit/agents";
import { expectedClientIdentity } from "./client-identity.js";
import { loadAgent, observeAgent } from "./agent-rpc-read.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import type { RpcContext } from "./rpc.js";
import { waitForAgentRun } from "./agent-run-tasks.js";
import {
  continuationRun,
  eventFrames,
  snapshotFrames,
  terminalFrames,
  terminalRun,
} from "./agent-protocol-frame-state.js";

/** Projects durable agent state into negotiated protocol frames while observation remains authorized.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param options - Application dependencies and configuration for this domain.
 * @param agentId - agent id supplied by the caller.
 * @param receipt - Durable accepted-run receipt identifying the thread and run.
 * @param after - Resume checkpoint after which observation continues.
 * @param signal - Cancellation signal inherited from the caller or owning scope.
 * @param includeEmptyObservations - Whether empty observations still produce checkpoint acknowledgements.
 * @returns Lazy protocol frames with resumable checkpoints and per-frame authorization.
 */
export async function* agentProtocolFrames(
  context: RpcContext,
  options: RouteMaterializationOptions,
  agentId: string,
  receipt: { readonly threadId: string; readonly runId: string },
  after?: JournalCheckpoint,
  signal?: AbortSignal,
  includeEmptyObservations = false,
): AsyncIterable<AgentProtocolEmission> {
  const sentText = new Map<string, string>();
  const sentParts = new Map<string, string>();
  const toolInputs = new Map<string, string>();
  const runIds = new Set([receipt.runId]);
  const expectedIdentity = expectedClientIdentity(context.hono.req.raw);
  let snapshot = await loadAgent({ agentId, threadId: receipt.threadId }, context, options);
  let currentRunId = continuationRun(snapshot, receipt.runId, runIds);
  if (
    after !== undefined &&
    terminalRun(snapshot, currentRunId) &&
    samePoint(after, snapshot.checkpoint)
  ) {
    return;
  }
  const cursor = after ?? { ...snapshot.checkpoint, sequence: "0" };
  const observer = new AbortController();
  const observerSignal =
    signal === undefined
      ? AbortSignal.any([context.hono.req.raw.signal, observer.signal])
      : AbortSignal.any([context.hono.req.raw.signal, observer.signal, signal]);
  const iterator = observeAgent(
    {
      agentId,
      threadId: receipt.threadId,
      after: cursor,
      ...(expectedIdentity === undefined ? {} : { expectedIdentity }),
    },
    context,
    options,
    observerSignal,
  )[Symbol.asyncIterator]();
  try {
    while (true) {
      const next = await iterator.next();
      if (next.done) return;
      const observation = next.value as AgentObservation;
      if (observation.kind === "event") {
        yield* emissions(
          eventFrames(observation.event, runIds, sentText, sentParts, toolInputs),
          observation.event.checkpoint,
          observation,
          includeEmptyObservations,
        );
        continue;
      }
      snapshot = observation.snapshot;
      currentRunId = continuationRun(snapshot, currentRunId, runIds);
      yield* emissions(
        snapshotFrames(
          snapshot,
          runIds,
          sentText,
          sentParts,
          toolInputs,
          observation.kind === "gap",
        ),
        snapshot.checkpoint,
        observation,
        includeEmptyObservations,
      );
      if (!terminalRun(snapshot, currentRunId)) continue;
      observer.abort();
      await iterator.return?.(undefined);
      await waitForAgentRun(receipt.runId);
      yield* emissions(terminalFrames(snapshot, currentRunId, sentText), snapshot.checkpoint);
      return;
    }
  } finally {
    observer.abort();
    await iterator.return?.(undefined);
  }
}

/** Adds resumable observation checkpoints to one batch of projected frames.
 * @param frames - Ordered projected protocol frames for one durable observation.
 * @param checkpoint - Resumable observation checkpoint bound to the resource scope.
 * @param observation - Observation metadata attached to public protocol frames.
 * @param includeEmptyObservation - Whether this empty frame batch produces an observation acknowledgement.
 * @returns Protocol emissions paired with the durable checkpoint for this batch.
 */
function* emissions(
  frames: Iterable<AgentProtocolFrame>,
  checkpoint: JournalCheckpoint,
  observation?: AgentObservation,
  includeEmptyObservation = false,
): Iterable<AgentProtocolEmission> {
  const values = [...frames];
  if (values.length === 0 && observation !== undefined && includeEmptyObservation) {
    values.push({ kind: "event", event: "observation", value: observation });
  }
  for (let index = 0; index < values.length; index += 1) {
    yield {
      frame: values[index]!,
      ...(index === values.length - 1 ? { checkpoint } : {}),
      ...(index === values.length - 1 && observation !== undefined ? { observation } : {}),
    };
  }
}

/** Compares observation checkpoints without relying on object identity.
 * @param left - First value or path participating in the comparison.
 * @param right - Second value or path participating in the comparison.
 * @returns Whether the value satisfies the required public contract.
 */
function samePoint(left: JournalCheckpoint, right: JournalCheckpoint): boolean {
  return (
    left.applicationId === right.applicationId &&
    left.environment === right.environment &&
    left.profile === right.profile &&
    left.providerEpoch === right.providerEpoch &&
    left.threadId === right.threadId &&
    left.sequence === right.sequence
  );
}
