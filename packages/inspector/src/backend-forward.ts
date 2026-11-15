/** Live operations are forwarded once; bridge rejections retain their HTTP status in the UI protocol. */
import { Effect, Option, Schema } from "effect";
import type { InspectionConnectionFile } from "relkit/inspector-api/connection";
import type { InspectorRemoteOperations } from "./remote.types.js";
import { backendError } from "./backend-history.js";
import { inspectorCallHeaders } from "./browser-boundary.js";
import { CLIENT_IDENTITY_PATH, type ApplicationIdentityJar } from "./application-identity.js";

/**
 * Sends an accepted page request to the application as the Inspector's own call, authenticated
 * by the session's bridge token. Inspection actions (`/_relkit/v1/...`) and route requests from
 * the composer are both sent without the browser's `Origin`, `Referer`, `Sec-Fetch-*` and
 * cookies, so they run without a user session; `Authorization` a developer typed, operation IDs
 * and streaming bodies are kept. With a jar, the call carries the tool's own anonymous identity
 * cookies, and the cookies the identity endpoint sets go to the jar instead of the browser.
 */
export const forwardBackend = Effect.fn("Inspector.forwardBackend")(function* (
  remote: InspectorRemoteOperations,
  connection: InspectionConnectionFile,
  request: Request,
  target?: string,
  jar?: ApplicationIdentityJar,
) {
  const url = new URL(request.url);
  const headers = inspectorCallHeaders(request.headers);
  const project = connection.descriptor.projectId;
  const cookie = jar?.cookie(project);
  if (cookie !== undefined) headers.set("cookie", cookie);
  const answer = yield* remote.request(
    connection,
    `${url.pathname}${url.search}`,
    {
      method: request.method,
      headers,
      signal: request.signal,
      // Re-stream decoded bytes: Bun 1.3.10's native chunked passthrough can produce empty 400s.
      ...(request.body === null
        ? {}
        : { body: request.body.pipeThrough(new TransformStream()), duplex: "half" }),
    },
    target,
  );
  const response =
    jar !== undefined && url.pathname === CLIENT_IDENTITY_PATH && request.method === "GET"
      ? keepIdentity(jar, project, answer)
      : answer;
  if (response.ok || !response.headers.get("content-type")?.includes("application/json"))
    return response;
  const bytes = yield* remote.json(new Response(response.body, { headers: response.headers }));
  // An empty or non-JSON body (Better Auth redirects and bodiless 404s say application/json)
  // is the application's own response, not a bridge rejection.
  const payload = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Json))(bytes).pipe(
    Effect.option,
  );
  if (
    Option.isSome(payload) &&
    payload.value !== null &&
    typeof payload.value === "object" &&
    !Array.isArray(payload.value) &&
    "protocol" in payload.value &&
    payload.value.protocol === 1
  )
    return backendError(
      "error" in payload.value && typeof payload.value.error === "string"
        ? payload.value.error
        : "Inspection request rejected",
      response.status,
    );
  return new Response(bytes === "" ? null : bytes, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
});

/**
 * Moves the identity endpoint's cookies into the tool's jar. The browser must not receive them:
 * cookies ignore the port, so they would land on the application's host and replace the
 * developer's own.
 */
function keepIdentity(jar: ApplicationIdentityJar, project: string, response: Response): Response {
  const cookies = response.headers.getSetCookie();
  if (cookies.length === 0) return response;
  if (response.ok) jar.keep(project, cookies);
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
