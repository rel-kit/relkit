/** History queries stay in the standalone writer; no application config is executed. */
import { Effect } from "effect";
import {
  InspectorEndpointError,
  negotiateHeaders,
  queryErrorDetail,
  readObservabilityQuery,
} from "relkit/inspector-api";
import { InspectionConnectionError } from "relkit/inspector-api/connection";
import { MAX_OBSERVABILITY_QUERY_LIMIT, ObservabilityQueryError } from "relkit/observability";
import { validate } from "relkit/observability/query";
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
  // Validated here with the rules the history store applies, so a rejection carries the
  // validator's message and parameter; a code the worker reports keeps its message private.
  const read = yield* Effect.result(
    Effect.try(() => {
      const value = readObservabilityQuery(request);
      validate(value, MAX_OBSERVABILITY_QUERY_LIMIT);
      return value;
    }),
  );
  if (read._tag === "Failure") {
    const cause = read.failure.cause;
    if (cause instanceof ObservabilityQueryError)
      return backendError(cause.code, 400, queryErrorDetail(cause));
    return yield* Effect.fail(
      new InspectionConnectionError({
        operation: "RELKIT_OBSERVABILITY_QUERY_INVALID",
        cause: cause instanceof Error ? cause : new Error("Invalid query"),
      }),
    );
  }
  const query = read.success;
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

/**
 * Credential-free failures retain the UI's established error protocol.
 * @param error - Public code, or a short fixed sentence for tool states.
 * @param status - HTTP status.
 * @param detail - A rejected query's validation message and parameter; no other failure has one.
 * @returns The JSON error response.
 */
export function backendError(
  error: string,
  status: number,
  detail: { readonly message?: string; readonly parameter?: string } = {},
) {
  return Response.json(
    { protocol: "relkit.inspector", version: 1, error, ...detail },
    {
      status,
      headers: { "x-relkit-api-version": "1", "cache-control": "no-store" },
    },
  );
}
