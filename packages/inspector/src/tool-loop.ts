/** Serializes bounded discovery, recovery and collection independently from application requests. */
import { Cause, Clock, Effect, Ref } from "effect";
import { InspectionConnectionError } from "@relkit/inspector-api/connection";
import type { InspectionFilesOperations } from "@relkit/inspector-api/connection";
import type { InspectorDiscoveryOperations } from "./discovery.types.js";
import type { InspectorRemoteOperations } from "./remote.types.js";
import type { InspectorOptions } from "./options.types.js";
import type { InspectorToolStateRef } from "./tool-state.types.js";
import { collectInspectionBatch } from "./collector.js";
import type { ObservabilityStream } from "@relkit/observability";
import { publishSelection, publishCollection } from "./live-events.js";
import { acquireHistory, historyFailureHint, recoverInspection } from "./tool-history.js";

/** Fast history retries before backing off; a released lock is still picked up later. */
const HISTORY_FAST_RETRIES = 3;
const HISTORY_SLOW_RETRY_MS = 30_000;

/** Only one poll/batch can be pending; support failure uses a finite recovery interval. */
export const inspectionLoop = Effect.fn("Inspector.collectLoop")(function* (
  state: InspectorToolStateRef,
  discovery: InspectorDiscoveryOperations,
  remote: InspectorRemoteOperations,
  files: InspectionFilesOperations,
  options: InspectorOptions,
  stream: ObservabilityStream,
) {
  let nextDiscovery = 0;
  let historyFailures = 0;
  let nextHistoryRetry = 0;
  while (true) {
    const now = yield* Clock.currentTimeMillis;
    const cycle = Effect.gen(function* () {
      if (now >= nextDiscovery) {
        yield* selectConnection(state, discovery, options, stream);
        nextDiscovery = now + 1000;
      }
      if (historyFailures < HISTORY_FAST_RETRIES || now >= nextHistoryRetry)
        yield* acquireHistory(state, files, options);
      if (yield* collectCurrent(state, remote, options, stream)) historyFailures = 0;
    });
    yield* cycle.pipe(
      Effect.catchCause((cause) => {
        const reason = cause.reasons[0];
        if (cause.reasons.length !== 1 || reason?._tag !== "Fail") return Effect.failCause(cause);
        const error = reason.error;
        let notice: Effect.Effect<void> = Effect.void;
        if (error.operation.startsWith("history.")) {
          historyFailures++;
          if (historyFailures >= HISTORY_FAST_RETRIES)
            nextHistoryRetry = now + HISTORY_SLOW_RETRY_MS;
          const hint = historyFailureHint(error);
          if (hint && (historyFailures === 1 || historyFailures === HISTORY_FAST_RETRIES))
            notice = Effect.logWarning(
              historyFailures === 1 ? hint : `${hint}; retrying every 30s`,
            );
        }
        return notice.pipe(
          Effect.andThen(recoverInspection(state, error)),
          Effect.catchCause((cleanup) => Effect.failCause(Cause.combine(cause, cleanup))),
        );
      }),
    );
    yield* Effect.sleep(100);
  }
});

/** Never publishes a foreign connection beside an existing project's history. */
const selectConnection = Effect.fn("Inspector.selectConnection")(function* (
  state: InspectorToolStateRef,
  discovery: InspectorDiscoveryOperations,
  options: InspectorOptions,
  stream: ObservabilityStream,
) {
  const selection = yield* discovery.select(options).pipe(
    Effect.tapError(() =>
      Ref.update(state, (value) => ({
        ...value,
        selection: { state: "disconnected" as const, rejected: 1 },
      })),
    ),
  );
  const previous = yield* Ref.get(state);
  if (
    previous.history &&
    selection.state === "connected" &&
    previous.history.projectId !== selection.connection.descriptor.projectId
  )
    return yield* new InspectionConnectionError({
      operation: "history.foreign-project",
      cause: new Error("Choose a project-specific history directory"),
    });
  publishSelection(stream, previous.selection, selection);
  yield* Ref.update(state, (value) => ({ ...value, selection }));
});

/** A durable receipt advances state only after collection and acknowledgement complete. */
const collectCurrent = Effect.fn("Inspector.collectCurrent")(function* (
  state: InspectorToolStateRef,
  remote: InspectorRemoteOperations,
  options: InspectorOptions,
  stream: ObservabilityStream,
) {
  const current = yield* Ref.get(state);
  if (current.selection.state !== "connected" || !current.history) return false;
  const sessionId = current.selection.connection.descriptor.sessionId;
  const after = sessionId === current.sessionId ? current.through : 0;
  const batch = yield* collectInspectionBatch(
    remote,
    current.history.operations,
    current.selection.connection,
    after,
    options.target,
    current.lossKey,
  );
  publishCollection(stream, batch.changes);
  yield* Ref.update(state, (value) => ({
    ...value,
    sessionId,
    through: batch.through,
    error: undefined,
    incomplete: batch.incomplete || batch.gap,
    droppedRecords: batch.droppedRecords,
    lossKey: batch.lossKey,
    producerFailed: batch.producerFailed,
    producerDropped: batch.producerDropped,
  }));
  return true;
});
