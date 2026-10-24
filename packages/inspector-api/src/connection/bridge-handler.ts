/**
 * Authenticates every private bridge operation before exposing live metadata or
 * forwarding to the committed application generation. Browser origins, foreign
 * hosts/identities, historical queries and stale mutations fail at this boundary.
 */
import { timingSafeEqual } from "node:crypto";
import { Effect, Schema } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { readInspectionBody } from "./bridge-body.js";
import { InspectionConnectionError } from "./connection-error.js";
import type { InspectionDescriptor } from "./protocol.types.js";
import type { InspectionBridgeAuthority, InspectionTarget } from "./bridge.types.js";

/**
 * Creates a request operation borrowing only explicit session authority.
 * @param descriptor - Actual listening session, with private token and project ID.
 * @param authority - Committed-generation projection and native forward adapter.
 * @returns Safe Fetch handler; typed support failures never stop application work.
 */
export function createInspectionHandler(
  descriptor: InspectionDescriptor,
  authority: InspectionBridgeAuthority,
) {
  return Effect.fn("Inspection.request")((request: Request) =>
    observeExecution(
      "inspector",
      "connection.request",
      serveInspection(descriptor, authority, request).pipe(
        Effect.catchTag("InspectionConnectionError", (error) =>
          Effect.succeed(
            failure(
              error.operation === "body.too-large"
                ? 413
                : error.operation.startsWith("body.")
                  ? 400
                  : 503,
              error.operation,
            ),
          ),
        ),
      ),
      () => ({}),
    ),
  );
}

/**
 * Applies identity and generation fences before calling any application adapter.
 * @param descriptor - Current session authority, never a build-snapshot credential.
 * @param authority - Current generation and bounded collection capabilities.
 * @param request - Native request after listener body-size admission.
 * @returns Handshake, collection or one forwarding outcome without mutation retries.
 */
const serveInspection = Effect.fn("Inspection.serve")(function* (
  descriptor: InspectionDescriptor,
  authority: InspectionBridgeAuthority,
  request: Request,
) {
  const denied = inspectAccess(descriptor, request);
  if (denied !== undefined) return denied;
  const url = new URL(request.url);
  const target = authority.active();
  if (url.pathname === "/v1/handshake" && request.method === "GET")
    return Response.json(
      {
        protocol: 1,
        projectId: descriptor.projectId,
        sessionId: descriptor.sessionId,
        ...(target === undefined ? {} : { generationId: target.generationId }),
        capabilities: target?.capabilities ?? [],
      },
      { headers: { "cache-control": "no-store" } },
    );
  if (/^\/v1\/(records|ack)$/.test(url.pathname)) {
    if (authority.records === undefined) return failure(503, "collection.unavailable");
    return yield* authority.records(request);
  }
  if (!liveInspectionPath(url.pathname)) return failure(404, "path.unavailable");
  if (target === undefined) return failure(503, "generation.unavailable");
  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    request.headers.get("x-relkit-generation-id") !== target.generationId
  )
    return failure(409, "generation.stale");
  if (!["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"].includes(request.method))
    return failure(405, "method.unsupported");
  if (request.method === "GET" || request.method === "HEAD")
    return yield* forwardToApplication(descriptor, authority, target, request);
  return yield* forwardToApplication(descriptor, authority, target, yield* boundedRequest(request));
});

/** JSON validation belongs to control APIs; route-console bodies retain their native media type. */
const boundedRequest = Effect.fn("Inspection.boundedRequest")(function* (request: Request) {
  const control = /^\/(?:_relkit\/v1|rpc)(\/|$)/.test(new URL(request.url).pathname);
  const bytes = yield* readInspectionBody(request, control);
  if (control)
    yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Json))(
      new TextDecoder().decode(bytes),
    ).pipe(
      Effect.mapError(
        (cause) => new InspectionConnectionError({ operation: "body.invalid-json", cause }),
      ),
    );
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: bytes,
    signal: request.signal,
  });
});

/** Keeps transport authentication separate from the user's existing application authorization. */
function forwardToApplication(
  descriptor: InspectionDescriptor,
  authority: InspectionBridgeAuthority,
  target: InspectionTarget,
  request: Request,
) {
  const headers = new Headers(request.headers);
  const user = headers.get("x-relkit-user-authorization");
  headers.delete("x-relkit-user-authorization");
  if (user === null) headers.delete("authorization");
  else headers.set("authorization", user);
  headers.delete("x-relkit-inspector-session-token");
  if (/^\/_relkit\/v1(\/|$)/.test(new URL(request.url).pathname))
    headers.set("x-relkit-inspector-session-token", descriptor.token);
  return authority.forward(target, new Request(request, { headers })).pipe(
    Effect.map((response) => {
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set("x-relkit-generation-id", target.generationId);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    }),
  );
}

/**
 * Rejects browser access, host rebinding and cross-project/session authority.
 * @param descriptor - Actual session authority.
 * @param request - Native incoming request.
 * @returns A safe rejection or absence when all authentication checks pass.
 */
function inspectAccess(descriptor: InspectionDescriptor, request: Request): Response | undefined {
  const endpoint = new URL(descriptor.endpoint);
  if (
    request.headers.has("origin") ||
    (request.headers.get("host") ?? new URL(request.url).host) !== endpoint.host
  )
    return failure(403, "request.origin-or-host");
  const expected = Buffer.from(`Bearer ${descriptor.token}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  if (expected.length !== received.length || !timingSafeEqual(expected, received))
    return failure(401, "request.unauthorized");
  if (
    request.headers.get("x-relkit-project-id") !== descriptor.projectId ||
    request.headers.get("x-relkit-session-id") !== descriptor.sessionId
  )
    return failure(409, "request.identity");
}

/**
 * Keeps historical queries in the tool while preserving the existing route console.
 * @param path - Validated URL pathname.
 * @returns Whether this private bridge may forward the established live API path.
 */
function liveInspectionPath(path: string): boolean {
  if (path.startsWith("//") || /^\/v1(\/|$)/.test(path)) return false;
  if (/^\/_relkit\/v1\/(logs|requests|traces|stream|storage)(\/|$)/.test(path)) return false;
  return !path.startsWith("/_relkit") || path === "/_relkit/v1" || path.startsWith("/_relkit/v1/");
}

/**
 * Produces a credential-free failure with no reflected private payload.
 * @param status - HTTP rejection or support availability status.
 * @param error - Bounded diagnostic operation label.
 * @returns Uncached safe protocol response.
 */
function failure(status: number, error: string): Response {
  return Response.json(
    { protocol: 1, error },
    { status, headers: { "cache-control": "no-store" } },
  );
}
