/** Protects UI server requests and serves history locally while forwarding live operations once. */
import { timingSafeEqual } from "node:crypto";
import { Effect, Ref } from "effect";
import { streamResponse } from "@relkit/inspector-api";
import type { ObservabilityStream } from "@relkit/observability";
import type { InspectorRemoteOperations } from "./remote.types.js";
import type { InspectorToolState, InspectorToolStateRef } from "./tool-state.types.js";
import type { InspectorOptions } from "./options.types.js";
import { historyResponse, backendError } from "./backend-history.js";
import { forwardBackend } from "./backend-forward.js";

/** The packaged Next server alone receives credentials for this local hop. */
export function inspectorBackend(
  state: InspectorToolStateRef,
  remote: InspectorRemoteOperations,
  token: string,
  options: InspectorOptions,
  stream: ObservabilityStream,
) {
  return (request: Request) =>
    serveBackend(state, remote, token, options, stream, request).pipe(
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
}

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
  const current = yield* Ref.get(state);
  const url = new URL(request.url);
  if (url.pathname === "/health/live") return Response.json({ state: "listening" });
  if (
    current.history &&
    current.selection.state === "connected" &&
    current.history.projectId !== current.selection.connection.descriptor.projectId
  )
    return backendError("history.foreign-project", 503);
  const status = backendStatus(current, url.pathname);
  if (status) return status;
  const history = /^\/_relkit\/v1\/(logs|requests|traces)(?:\/([^/]+))?$/.exec(url.pathname);
  if (history && request.method === "GET") return yield* historyResponse(current, request, history);
  if (url.pathname === "/_relkit/v1/stream" && request.method === "GET")
    return yield* Effect.sync(() => streamResponse(stream, request, 1));
  if (current.selection.state !== "connected")
    return backendError(
      current.selection.state === "ambiguous"
        ? "Select a connection file explicitly"
        : "Inspector disconnected",
      503,
    );
  return yield* forwardBackend(remote, current.selection.connection, request, options.target);
});

/** Projects history readiness without leaking private connection descriptors or credentials. */
function backendStatus(current: InspectorToolState, path: string): Response | undefined {
  if (path === "/_relkit/v1/storage")
    return Response.json(
      {
        protocol: "relkit.observability.query",
        version: 1,
        state: current.history && current.error === undefined ? "ready" : "degraded",
        connection: current.selection.state,
        error: current.error,
        incomplete: current.incomplete,
        dropped: current.droppedRecords,
        producerFailed: current.producerFailed ?? 0,
        producerDropped: current.producerDropped ?? 0,
      },
      { headers: { "x-relkit-api-version": "1" } },
    );
  if (path === "/health/ready")
    return Response.json(
      { state: current.selection.state },
      {
        status:
          current.selection.state === "connected" && current.history && current.error === undefined
            ? 200
            : 503,
      },
    );
}
