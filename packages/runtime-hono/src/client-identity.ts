import type { MaybePromise } from "@relkit/contracts";
import {
  CLIENT_IDENTITY_HEADERS,
  type ClientIdentityDocument,
  type ExpectedClientIdentity,
} from "@relkit/contracts";
import type { Hono } from "hono";
import type { HttpAuthInvocation } from "./auth.js";

export const CLIENT_IDENTITY_PATH = "/_relkit/v1/client/identity";

export interface ResolvedClientIdentity extends ExpectedClientIdentity {
  readonly setCookies?: readonly string[];
}

export interface ClientIdentityRuntime {
  readonly applicationId: string;
  readonly publicFingerprint: string;
  readonly resolve: (input: {
    readonly request: Request;
    readonly session: unknown | null;
  }) => MaybePromise<ResolvedClientIdentity>;
}

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
    };
    return context.json(document, 200, CLIENT_IDENTITY_HEADERS);
  });
}

export async function resolveClientIdentity(
  runtime: ClientIdentityRuntime,
  request: Request,
  auth: HttpAuthInvocation | undefined,
  fresh = false,
): Promise<ResolvedClientIdentity> {
  const session = (await auth?.getSession({ fresh })) ?? null;
  const identity = await runtime.resolve({ request, session });
  if (identity.identityScope === "" || identity.sessionEpoch === "") {
    throw new TypeError("Client identity scope and session epoch must be non-empty.");
  }
  return identity;
}

export function expectedClientIdentity(request: Request): ExpectedClientIdentity | undefined {
  const identityScope = request.headers.get("x-relkit-identity-scope");
  const sessionEpoch = request.headers.get("x-relkit-session-epoch");
  return identityScope === null || sessionEpoch === null
    ? undefined
    : { identityScope, sessionEpoch };
}
