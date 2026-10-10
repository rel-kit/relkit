/**
 * Reads authorized journal pages and projects bounded public frames. This module
 * imports the small event projection entrypoint rather than agent execution;
 * the stream consumer owns waits, cancellation and fresh frame authorization.
 */
import { agentClientEvents } from "@relkit/agents/client-events";
import { REALTIME_RUNTIME_LIMITS } from "@relkit/contracts";
import { Clock, Effect, Option } from "effect";
import { httpBoundary, observeHttp } from "./http-effect.js";
import { clientAgentSnapshot } from "./agent-compatibility.js";
import type {
  AgentObservationFrame,
  ObservationAccess,
  ObservationAuthorize,
  ObservationPageState,
} from "./agent-observation.types.js";

/**
 * Fetches one page after optional owned wait and current authorization.
 * @param authorize - Refreshes request identity and provider scope each time.
 * @param threadId - Already validated requested thread identity.
 * @param state - Complete decoded page checkpoint and wait policy.
 * @param signal - Optional native transport cancellation combined with fiber cancellation.
 * @returns Ordered frames and next state, or typed provider/authorization failure.
 */
export const readObservationPage = Effect.fn("AgentObservation.readPage")(function* (
  authorize: ObservationAuthorize,
  threadId: string,
  state: ObservationPageState,
  signal?: AbortSignal,
) {
  if (signal?.aborted) return [[], Option.none<ObservationPageState>()] as const;
  const resolved = yield* authorize();
  if (state.wait) {
    const now = yield* Clock.currentTimeMillis;
    yield* httpBoundary("agent.observe.wait", (fiberSignal) =>
      resolved.provider.waitForJournal({
        ...resolved.scope,
        threadId,
        after: state.after,
        deadlineMs: now + 15_000,
        signal: signal === undefined ? fiberSignal : AbortSignal.any([signal, fiberSignal]),
      }),
    );
  }
  const page = yield* observeHttp(
    "agent.observe.read",
    httpBoundary("agent.observe.read", () =>
      resolved.provider.readJournal({
        ...resolved.scope,
        threadId,
        after: state.after,
        limit: 100,
        maxEncodedBytes: 1024 * 1024,
      }),
    ),
  );
  const frames: AgentObservationFrame[] = [];
  if (page.gap !== undefined) {
    const snapshot = yield* readObservationSnapshot(resolved, threadId);
    frames.push({ kind: "gap", reason: page.gap, snapshot });
    return [frames, Option.some({ after: snapshot.checkpoint, wait: false })] as const;
  }
  for (const record of page.records)
    for (const event of agentClientEvents(record)) frames.push({ kind: "event", event });
  if (
    page.records.some((record) =>
      ["approval", "control", "terminal", "interruption"].includes(record.kind),
    )
  )
    frames.push({
      kind: "snapshot",
      snapshot: yield* readObservationSnapshot(resolved, threadId),
    });
  return [frames, Option.some({ after: page.checkpoint, wait: !page.hasMore })] as const;
});

/**
 * Loads a bounded public snapshot through the already authorized provider scope.
 * @param resolved - Fresh request identity and provider lease from the current page.
 * @param threadId - Validated requested thread identity.
 * @returns Compatibility-projected snapshot or typed native provider failure.
 */
const readObservationSnapshot = Effect.fn("AgentObservation.snapshot")(function* (
  resolved: ObservationAccess,
  threadId: string,
) {
  return clientAgentSnapshot(
    yield* httpBoundary("agent.observe.snapshot", () =>
      resolved.provider.loadThread({
        ...resolved.scope,
        threadId,
        maxEncodedBytes: REALTIME_RUNTIME_LIMITS.initialSnapshotBytes,
      }),
    ),
  );
});
