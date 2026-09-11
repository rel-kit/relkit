import type { AgentObservation, JournalCheckpoint, JournalRecord } from "@relkit/agents";
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

export type AgentProtocolFrame =
  | { readonly kind: "state"; readonly value: unknown }
  | { readonly kind: "text-start"; readonly messageId: string }
  | { readonly kind: "text-delta"; readonly messageId: string; readonly delta: string }
  | { readonly kind: "text-end"; readonly messageId: string }
  | ({
      readonly kind: "progress";
      readonly partId: string;
      readonly value: unknown;
    } & import("@relkit/agents").AgentProgressScope)
  | { readonly kind: "approval"; readonly approvalId: string; readonly value: unknown }
  | {
      readonly kind: "event";
      readonly event: JournalRecord["kind"] | "execution" | "execution-snapshot" | "observation";
      readonly value: unknown;
      readonly eventId?: string;
      readonly recordId?: string;
      readonly runId?: string;
      readonly createdAt?: string;
    }
  | {
      readonly kind: "tool";
      readonly toolCallId: string;
      readonly toolId: string;
      readonly state: import("@relkit/agents").ToolPartState;
      readonly value?: unknown;
      readonly inputStarted?: boolean;
      readonly inputDelta?: string;
    }
  | {
      readonly kind: "terminal";
      readonly threadId: string;
      readonly runId: string;
      readonly status: string;
      readonly text?: string;
    };

export interface AgentProtocolEmission {
  readonly frame: AgentProtocolFrame;
  readonly checkpoint?: JournalCheckpoint;
  readonly observation?: AgentObservation;
}

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
