/** History queries stay in the standalone writer; no application config is executed. */
import { Effect } from "effect";
import {
  InspectorEndpointError,
  negotiateHeaders,
  readObservabilityQuery,
} from "@relkit/inspector-api";
import { InspectionConnectionError } from "@relkit/inspector-api/connection";
import type { InspectorToolState } from "./tool-state.types.js";

/** Decodes only supported query/detail paths and returns their existing public protocol. */
export const historyResponse = Effect.fn("Inspector.historyResponse")(function* (
  current: InspectorToolState,
  request: Request,
  match: RegExpExecArray,
) {
  const negotiation = yield* Effect.result(Effect.try(() => negotiateHeaders(request)));
  if (negotiation._tag === "Failure") {
    const cause = negotiation.failure.cause;
    if (cause instanceof InspectorEndpointError) return backendError(cause.code, cause.status);
    return yield* Effect.die(cause);
  }
  if (!current.history) return backendError("History unavailable", 503);
  const kind = match[1] === "logs" ? "logs" : match[1] === "requests" ? "requests" : "traces";
  const query = yield* Effect.try({
    try: () => readObservabilityQuery(request),
    catch: (cause) =>
      new InspectionConnectionError({
        operation: "RELKIT_OBSERVABILITY_QUERY_INVALID",
        cause: cause instanceof Error ? cause : new Error("Invalid query"),
      }),
  });
  const id = yield* Effect.try({
    try: () => (match[2] === undefined ? undefined : decodeURIComponent(match[2])),
    catch: (cause) =>
      new InspectionConnectionError({
        operation: "RELKIT_OBSERVABILITY_QUERY_INVALID",
        cause: cause instanceof Error ? cause : new Error("Invalid detail identifier"),
      }),
  });
  const result = yield* current.history.operations.call(
    id === undefined
      ? { type: "query", kind, query }
      : {
          type: "detail",
          kind: kind === "logs" ? "log" : kind === "requests" ? "request" : "trace",
          id,
        },
  );
  return result === undefined
    ? backendError("Not found", 404)
    : Response.json(result, { headers: { "x-relkit-api-version": "1" } });
});

/** Credential-free failures retain the UI's established error protocol. */
export function backendError(error: string, status: number) {
  return Response.json(
    { protocol: "relkit.inspector", version: 1, error },
    {
      status,
      headers: { "x-relkit-api-version": "1", "cache-control": "no-store" },
    },
  );
}
