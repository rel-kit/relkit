/** Registers actual local Better Auth users and consumes native response bodies before borrowing issued identity for protected network requests. */
import { expect } from "bun:test";
import { Effect, Schema } from "effect";
import { generatedBody } from "./generated-host-http.js";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";
import { ProtectedSignup, ProtectedIdentity } from "./generated-protection.schemas.js";
import type { ProtectedUser } from "./generated-protection.types.js";
import type { GeneratedHostSession } from "./generated-host.types.js";

/**
 * Creates one real local session and reads its trusted identity from the actual generated backend.
 * @param host - Caller-scoped native server.
 * @param name - Stable private fixture user name.
 * @param tenant - Test-owned email domain used by application tenant authorization.
 * @returns Private cookie, actual user ID and server-issued client identity.
 */
export const createProtectedUser = Effect.fn("GeneratedProtection.user")(function* (
  host: GeneratedHostSession,
  name: string,
  tenant: string,
) {
  const response = yield* host.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: host.baseURL },
    body: JSON.stringify({
      name,
      email: name.toLowerCase() + "@" + tenant,
      password: "private-owned-password-123",
    }),
  });
  expect(response.status).toBe(200);
  const signup = yield* generatedBody(response).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(ProtectedSignup)),
  );
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie) throw new Error("Native signup omitted its session cookie");
  const identityResponse = yield* host.request("/_relkit/v1/client/identity", {
    headers: { cookie },
  });
  const identity = yield* generatedBody(identityResponse).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(ProtectedIdentity)),
  );
  return { ownerId: signup.user.id, tenant, cookie, ...identity } satisfies ProtectedUser;
});

/**
 * Executes real GET routing, middleware and nested function/tool protection for one requested subject.
 * @param host - Actual generated server.
 * @param path - Native public route member.
 * @param actor - Actual session making the request, or anonymous absence.
 * @param subject - Requested owner and tenant.
 * @returns HTTP status and complete consumed native body.
 */
export const requestProtectedSubject = Effect.fn("GeneratedProtection.subject")(function* (
  host: GeneratedHostSession,
  path: string,
  actor: ProtectedUser | undefined,
  subject: Pick<ProtectedUser, "ownerId" | "tenant">,
) {
  const query = new URLSearchParams({ ownerId: subject.ownerId, tenant: subject.tenant });
  const response = yield* host.request(
    `/ownership/${path}?${query}`,
    actor ? { headers: { cookie: actor.cookie } } : undefined,
  );
  const body = yield* scaffoldNative("protection.http.body", () => response.text());
  return { status: response.status, body };
});
