/** Live operations are forwarded once; bridge rejections retain their HTTP status in the UI protocol. */
import { Effect, Schema } from "effect";
import { InspectionConnectionError } from "@relkit/inspector-api/connection";
import type { InspectionConnectionFile } from "@relkit/inspector-api/connection";
import type { InspectorRemoteOperations } from "./remote.types.js";
import { backendError } from "./backend-history.js";

/** Preserves native cookies, authorization, operation IDs and streaming bodies. */
export const forwardBackend = Effect.fn("Inspector.forwardBackend")(function* (
  remote: InspectorRemoteOperations,
  connection: InspectionConnectionFile,
  request: Request,
  target?: string,
) {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.delete("x-relkit-inspector-token");
  const response = yield* remote.request(
    connection,
    `${url.pathname}${url.search}`,
    {
      method: request.method,
      headers,
      signal: request.signal,
      ...(request.body === null ? {} : { body: request.body, duplex: "half" }),
    },
    target,
  );
  if (response.ok || !response.headers.get("content-type")?.includes("application/json"))
    return response;
  const bytes = yield* remote.json(new Response(response.body, { headers: response.headers }));
  const payload = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Json))(bytes).pipe(
    Effect.mapError(
      (cause) => new InspectionConnectionError({ operation: "remote.error-invalid", cause }),
    ),
  );
  if (
    payload !== null &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    "protocol" in payload &&
    payload.protocol === 1
  )
    return backendError(
      "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "Inspection request rejected",
      response.status,
    );
  return new Response(bytes, { status: response.status, headers: response.headers });
});
