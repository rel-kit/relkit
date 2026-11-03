/** Reuses supervisor request/body ownership so inspection participates in native generation draining. */
import { Cause, Effect } from "effect";
import type { Scope } from "effect";
import { proxyRequest } from "../supervisor/proxy-request.js";
import { InspectionConnectionError } from "relkit/inspector-api/connection";
import type { InspectionBridgeAuthority } from "relkit/inspector-api/connection";
import type { DevSession } from "./dev-session.js";

/** Captures the committed candidate and lease before any forwarding await; mutations never retry. */
export function forwardDevInspection(
  session: DevSession,
  scope: Scope.Closeable,
): InspectionBridgeAuthority["forward"] {
  return (target, request) =>
    Effect.suspend(() => {
      const candidate = session.active;
      if (!candidate || target.generationId !== `generation-${candidate.token.generationToken}`)
        return Effect.succeed(
          Response.json({ protocol: 1, error: "generation.stale" }, { status: 409 }),
        );
      const { token } = candidate;
      const { listener, origin } = inspectionOrigins(session, {
        ...process.env,
        ...candidate.environment,
      });
      // Built before the lease is tracked: proxyRequest's scope is what releases it.
      return Effect.try({
        try: () => firstPartyInspectionRequest(request, listener, origin),
        catch: forwardFailure,
      }).pipe(
        Effect.flatMap((forwarded) => {
          const lease = session.drains
            .get(`${token.sourceToken}:${token.generationToken}`)
            ?.track(token);
          if (!lease)
            return Effect.succeed(
              Response.json({ protocol: 1, error: "generation.draining" }, { status: 409 }),
            );
          return proxyRequest(
            forwarded,
            {
              target: {
                token,
                port: candidate.port,
                hostname: session.options.candidateHostname ?? "127.0.0.1",
              },
              lease,
              scope,
            },
            fetch,
          ).pipe(Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, forwardFailure))));
        }),
      );
    });
}

/** Reports any forwarding failure as the bridge's own connection error. */
function forwardFailure(error: unknown): InspectionConnectionError {
  return new InspectionConnectionError({
    operation: "generation.forward",
    cause:
      error instanceof Error ? error : new Error("Inspection forwarding failed", { cause: error }),
  });
}

/**
 * Addresses an inspector request to the public listener as a call from the application's own page.
 * @param request - Token-authenticated bridge request; its browser origin was checked by the Inspector UI.
 * @param listener - Public listener origin that receives the request (its URL and Host).
 * @param origin - Origin the application and its auth SDK trust; the listener by default.
 * @returns A request carrying the listener's URL and Host and the trusted Origin.
 * @remarks The UI strips browser Origin/Referer, and origin-less mutations fail SDK CSRF checks
 * (Better Auth rejects them because Node fetch adds `sec-fetch-mode`).
 */
export function firstPartyInspectionRequest(
  request: Request,
  listener: string,
  origin: string = listener,
): Request {
  const incoming = new URL(request.url);
  const url = new URL(`${incoming.pathname}${incoming.search}`, listener);
  const headers = new Headers(request.headers);
  headers.set("origin", new URL(origin).origin);
  headers.delete("referer");
  // Streaming request bodies need `duplex`, which the DOM `RequestInit` type does not declare.
  const init: RequestInit & { readonly duplex: "half" } = {
    method: request.method,
    headers,
    body: request.body,
    signal: request.signal,
    redirect: "manual",
    duplex: "half",
  };
  return new Request(url.href, init);
}

/**
 * Where an inspector request is sent and which Origin it carries.
 * @param session - Dev session whose public listener receives the forwarded request.
 * @param environment - The application child's environment: inherited values plus dotenv overrides.
 * @returns The listener (the bind address, with wildcard binds reached through loopback) and the
 * Origin: a loopback `BETTER_AUTH_URL` on any port, so a frontend served elsewhere stays trusted.
 * When that URL names this listener, it is also the listener, keeping Host and Origin identical.
 */
export function inspectionOrigins(
  session: Pick<DevSession, "backendPort" | "options">,
  environment: Readonly<Record<string, string | undefined>>,
): { readonly listener: string; readonly origin: string } {
  const configured = session.options.hostname ?? "127.0.0.1";
  const host = configured === "0.0.0.0" || configured === "::" ? "127.0.0.1" : configured;
  const authority = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  const bound = `http://${authority}:${session.backendPort}`;
  const declared = loopbackOrigin(environment.BETTER_AUTH_URL);
  if (declared === undefined) return { listener: bound, origin: bound };
  const samePort = new URL(declared).port === String(session.backendPort);
  return { listener: samePort ? declared : bound, origin: declared };
}

/** Accepts only an http loopback URL; any other base URL is not a local page of this app. */
function loopbackOrigin(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    const url = new URL(value);
    const loopback =
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.hostname.endsWith(".localhost");
    return url.protocol === "http:" && loopback ? url.origin : undefined;
  } catch {
    return undefined;
  }
}
