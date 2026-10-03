import type {
  ClientIdentityHeaders,
  ClientIdentityRuntime,
  ResolvedClientIdentity,
} from "./client-identity.types.js";
export type {
  ClientIdentityHeaders,
  ClientIdentityRuntime,
  ResolvedClientIdentity,
} from "./client-identity.types.js";

import {
  CLIENT_IDENTITY_HEADERS,
  type ClientIdentityDocument,
  type ExpectedClientIdentity,
} from "@relkit/contracts";
import { Context, Effect, Layer } from "effect";
import type { Hono } from "hono";
import type { HttpAuthInvocation } from "./auth.js";
import { httpBoundary, HttpBoundaryError, observeHttp, runHttp } from "./http-effect.js";

export const CLIENT_IDENTITY_PATH = "/_relkit/v1/client/identity";

/** Registers the identity document endpoint and forwards resolver-set cookies.
 * @param app - Hono application receiving the configured endpoints or middleware.
 * @param runtime - Configured runtime and provider dependencies.
 * @param auth - Optional request authentication context or middleware configuration.
 * @returns Nothing; registers the identity document endpoint with no-store response headers.
 */
export function installClientIdentityEndpoint(
  app: Hono,
  runtime: ClientIdentityRuntime,
  auth: { readonly contextFor: (request: Request) => HttpAuthInvocation } | undefined,
): void {
  app.get(CLIENT_IDENTITY_PATH, async (context) => {
    const request = context.req.raw;
    const identity = await resolveClientIdentity(runtime, request, auth?.contextFor(request));
    for (const cookie of identity.setCookies ?? []) {
      context.header("Set-Cookie", cookie, { append: true });
    }
    const document: ClientIdentityDocument = {
      protocol: "relkit.client-identity",
      version: 1,
      applicationId: runtime.applicationId,
      identityScope: identity.identityScope,
      sessionEpoch: identity.sessionEpoch,
      publicFingerprint: runtime.publicFingerprint,
      issuedAt: new Date().toISOString(),
      ...(runtime.jobs === undefined ? {} : { jobs: runtime.jobs }),
    };
    return context.json(document, 200, CLIENT_IDENTITY_HEADERS);
  });
}

/** Resolve the current session and require nonempty public identity metadata.
 * @param runtime - Application identity resolver and public contract configuration.
 * @param request - Request supplied to the trusted identity callback.
 * @param auth - Optional session authority for the current request.
 * @param fresh - Whether to bypass cached session state for this observation.
 * @returns A lazy effect yielding the resolved identity and any response cookies.
 */
const resolveIdentity = Effect.fn("ClientIdentity.resolve")(function* (
  runtime: ClientIdentityRuntime,
  request: Request,
  auth: HttpAuthInvocation | undefined,
  fresh = false,
) {
  const session =
    (yield* httpBoundary("identity.session", () => Promise.resolve(auth?.getSession({ fresh })))) ??
    null;
  const identity = yield* httpBoundary("identity.resolve", () =>
    Promise.resolve(runtime.resolve({ request, session })),
  );
  if (identity.identityScope === "" || identity.sessionEpoch === "") {
    return yield* Effect.fail(
      new HttpBoundaryError({
        operation: "identity.resolve",
        cause: new TypeError("Client identity scope and session epoch must be non-empty."),
      }),
    );
  }
  return identity;
});

/** Resolves trusted identity using the current request session and configured callback. */
export class ClientIdentity extends Context.Service<
  ClientIdentity,
  { readonly resolve: typeof resolveIdentity }
>()("@relkit/runtime-hono/ClientIdentity") {}

/** Live identity workflow preserves explicit fresh-session observations. */
export const ClientIdentityLive = Layer.succeed(ClientIdentity, {
  resolve: (...args) => observeHttp("identity.resolve", resolveIdentity(...args)),
});

/** Resolves identity at the native request boundary.
 * @param runtime - Configured runtime and provider dependencies.
 * @param request - Native request whose headers, body and cancellation signal define this operation.
 * @param auth - Optional request authentication context or middleware configuration.
 * @param fresh - Whether the session cache must be refreshed for this observation.
 * @returns A Promise for validated identity metadata and optional resolver-produced cookies.
 */
export function resolveClientIdentity(
  runtime: ClientIdentityRuntime,
  request: Request,
  auth: HttpAuthInvocation | undefined,
  fresh = false,
): Promise<ResolvedClientIdentity> {
  return runHttp(
    Effect.flatMap(ClientIdentity, (identity) =>
      identity.resolve(runtime, request, auth, fresh),
    ).pipe(Effect.provide(ClientIdentityLive)),
  );
}

/** Reads the client's expected identity from HTTP or oRPC headers.
 * @param request - Native request whose headers, body and cancellation signal define this operation.
 * @param rpcHeaders - Additional oRPC headers used when native request headers are absent.
 * @returns Both expected identity values, or undefined if either header is absent.
 */
export function expectedClientIdentity(
  request: Request,
  rpcHeaders?: ClientIdentityHeaders,
): ExpectedClientIdentity | undefined {
  const identityScope =
    request.headers.get("x-relkit-identity-scope") ?? header(rpcHeaders, "x-relkit-identity-scope");
  const sessionEpoch =
    request.headers.get("x-relkit-session-epoch") ?? header(rpcHeaders, "x-relkit-session-epoch");
  return identityScope === null || sessionEpoch === null
    ? undefined
    : { identityScope, sessionEpoch };
}

/** Looks up a case-insensitive header and selects its first public value.
 * @param headers - Native or protocol headers available to this request.
 * @param name - Declared field, header, stream or configuration key.
 * @returns The first matching header value, or null when no supported value exists.
 */
function header(headers: ClientIdentityHeaders | undefined, name: string): string | null {
  if (headers === undefined) return null;
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  if (entry === undefined) return null;
  return Array.isArray(entry[1]) ? (entry[1][0] ?? null) : (entry[1] ?? null);
}
