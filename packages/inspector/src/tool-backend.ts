/** Protects UI server requests and serves history locally while forwarding live operations once. */
import { timingSafeEqual } from "node:crypto";
import { Effect, Ref } from "effect";
import { streamResponse } from "relkit/inspector-api";
import {
  ObservabilityQueryError,
  ObservabilityStreamError,
  type ObservabilityStream,
} from "relkit/observability";
import type { InspectorRemoteOperations } from "./remote.types.js";
import type { InspectorToolState, InspectorToolStateRef } from "./tool-state.types.js";
import type { InspectorOptions } from "./options.types.js";
import { historyResponse, backendError } from "./backend-history.js";
import { forwardBackend } from "./backend-forward.js";
import { ExecutionSuccessLogs } from "relkit/contracts/operation";
import { publishSelectionState } from "./live-events.js";
import { crossSiteRefusal } from "./browser-boundary.js";
import { collectionState, historyError, historyFailure, historyReadable } from "./history-state.js";

/**
 * The Inspector's session with the application, apart from the UI's own stream to the Inspector.
 * @param current - Tool state.
 * @returns `state`: `connected` (one live `relkit dev` session), `disconnected` (none found or it
 * stopped answering) or `ambiguous` (several; pass `--connection-file`); `sessionId` and
 * `generationId` of the connected session or null; `sessions`: the candidates when ambiguous;
 * `since`: ISO time the state began, or null before the first discovery; `lastSessionId`: the
 * last session this run of the tool connected to, or null when none ever did; and
 * `lastConnectedUntil`: ISO time that session stopped answering, or null while it is connected
 * or when none ever connected. Both survive the tool's own UI connections, so every tab tells a
 * stopped session from one that never started.
 */
function applicationStatus(current: InspectorToolState) {
  const selection = current.selection;
  const handshake = selection.state === "connected" ? selection.handshake : undefined;
  return {
    state: selection.state,
    sessionId: handshake?.sessionId ?? null,
    generationId: handshake?.generationId ?? null,
    sessions: selection.state === "ambiguous" ? [...selection.sessions] : [],
    since:
      current.selectionSince === undefined ? null : new Date(current.selectionSince).toISOString(),
    lastSessionId: current.lastSession?.sessionId ?? null,
    lastConnectedUntil:
      current.lastSession?.stoppedAt === undefined
        ? null
        : new Date(current.lastSession.stoppedAt).toISOString(),
  };
}

/** The packaged Next server alone receives credentials for this local hop. */
export function inspectorBackend(
  state: InspectorToolStateRef,
  remote: InspectorRemoteOperations,
  token: string,
  options: InspectorOptions,
  stream: ObservabilityStream,
) {
  return (request: Request) => {
    const served = serveBackend(state, remote, token, options, stream, request).pipe(
      Effect.catchTag("InspectionConnectionError", (error) =>
        Effect.succeed(
          backendError(
            error.operation,
            [
              "RELKIT_OBSERVABILITY_QUERY_INVALID",
              "RELKIT_OBSERVABILITY_QUERY_PROTOCOL_MISMATCH",
            ].includes(error.operation)
              ? 400
              : 503,
          ),
        ),
      ),
    );
    // The listener silences routine success logs for UI polling; actions and mutations
    // sent with an unsafe method keep their completion record.
    return safeMethods.has(request.method)
      ? served
      : served.pipe(Effect.provideService(ExecutionSuccessLogs, true));
  };
}

/** Read-only methods the UI uses for polling and history. */
const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

/** A browser can neither choose a target/path on disk nor provide bridge credentials. */
const serveBackend = Effect.fn("Inspector.backend")(function* (
  state: InspectorToolStateRef,
  remote: InspectorRemoteOperations,
  token: string,
  options: InspectorOptions,
  stream: ObservabilityStream,
  request: Request,
) {
  const expected = Buffer.from(token);
  const received = Buffer.from(request.headers.get("x-relkit-inspector-token") ?? "");
  if (
    request.headers.has("origin") ||
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  )
    return backendError("Unauthorized", 401);
  const crossSite = crossSiteRefusal(request);
  if (crossSite) return crossSite;
  const current = yield* Ref.get(state);
  const url = new URL(request.url);
  if (url.pathname === "/health/live") return Response.json({ state: "listening" });
  if (
    current.history &&
    current.selection.state === "connected" &&
    current.history.projectId !== current.selection.connection.descriptor.projectId
  )
    return backendError("history.foreign-project", 503);
  const status = backendStatus(current, url.pathname, stream);
  if (status) return status;
  const history = /^\/_relkit\/v1\/(logs|requests|traces)(?:\/([^/]+))?$/.exec(url.pathname);
  if (history && request.method === "GET") return yield* historyResponse(current, request, history);
  if (url.pathname === "/_relkit/v1/stream" && request.method === "GET") {
    // The subscriber replays it as its newest event, even when the session never changed.
    publishSelectionState(stream, current.selection);
    return yield* localStreamResponse(stream, request);
  }
  if (current.selection.state !== "connected")
    return backendError(
      current.selection.state === "ambiguous"
        ? "Select a connection file explicitly"
        : "Inspector disconnected",
      503,
    );
  return yield* forwardBackend(remote, current.selection.connection, request, options.target);
});

/**
 * Converts expected native replay validation failures into the browser protocol.
 * @param stream - Borrowed tool-owned event feed.
 * @param request - Authenticated UI request carrying replay selectors and cancellation.
 * @returns A lazy SSE response or 400 JSON; unexpected defects retain their identity.
 */
const localStreamResponse = Effect.fn("Inspector.streamResponse")(
  (stream: ObservabilityStream, request: Request) =>
    Effect.try(() => streamResponse(stream, request, 1)).pipe(
      Effect.catch((error) => {
        const cause = error.cause;
        if (cause instanceof ObservabilityStreamError || cause instanceof ObservabilityQueryError)
          return Effect.succeed(backendError(cause.code, 400));
        return Effect.die(cause);
      }),
    ),
);

/** Projects history readiness without leaking private connection descriptors or credentials. */
function backendStatus(
  current: InspectorToolState,
  path: string,
  stream: ObservabilityStream,
): Response | undefined {
  if (path === "/_relkit/v1/storage")
    return Response.json(
      {
        protocol: "relkit.observability.query",
        version: 1,
        // `degraded` only when history itself is unavailable; an application outage keeps
        // retained history readable and is said by `collection`.
        state: historyReadable(current) ? "ready" : "degraded",
        collection: collectionState(current),
        connection: current.selection.state,
        application: applicationStatus(current),
        // Pages read any `error` as a history failure, so an application's failure is apart.
        error: historyError(current),
        applicationError:
          current.error && !historyFailure(current.error) ? current.error : undefined,
        incomplete: current.incomplete,
        recordsLostBeforeHistory: {
          // Records the application's producer could not hand to its inspection buffer.
          byApplicationProducer: current.producerDropped ?? 0,
          // Records the application's inspection buffer evicted before the Inspector stored them.
          byInspectionBuffer: current.droppedRecords,
        },
        // Invalidations the tool's stream dropped for a slow interface; no record is lost.
        missedLiveUpdates: stream.counters().subscriberDropped,
        /** @deprecated Same as `recordsLostBeforeHistory.byInspectionBuffer`. */
        dropped: current.droppedRecords,
        producerFailed: current.producerFailed ?? 0,
        /** @deprecated Same as `recordsLostBeforeHistory.byApplicationProducer`. */
        producerDropped: current.producerDropped ?? 0,
      },
      { headers: { "x-relkit-api-version": "1" } },
    );
  if (path === "/health/ready")
    return Response.json(
      { state: current.selection.state },
      {
        status:
          current.selection.state === "connected" && historyReadable(current) && current.error === undefined
            ? 200
            : 503,
      },
    );
}
