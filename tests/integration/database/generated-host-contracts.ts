/** Verifies the real generated specialized host's transaction, lazy ownership, session, protection and shutdown contracts in either layout. */
import { expect } from "bun:test";
import { Effect, Schema } from "effect";
import { GeneratedHost } from "./generated-host.service.js";
import { GeneratedSessionResponse, GeneratedProfileResponse } from "./generated-host.schemas.js";
import type { GeneratedHostSession } from "./generated-host.types.js";
import { generatedBody } from "./generated-host-http.js";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";

/**
 * Runs all original native host assertions against one physical source layout.
 * @param grouped - Whether the grouped default or equivalent flat compatibility project is required.
 * @returns Completion after native assertions, graceful shutdown and complete output settlement.
 */
export const verifyGeneratedHost = Effect.fn("GeneratedHost.verify")(function* (grouped: boolean) {
  const service = yield* GeneratedHost;
  const host = yield* service.start(grouped);
  expect(yield* host.read(".relkit/build/server/index.ts")).toContain(
    "instrumentation: specializedInstrumentation",
  );
  expect(yield* host.records("write")).toMatchObject({ count: 1 });
  expect(yield* host.records("rollback")).toMatchObject({ count: 1 });
  expect(yield* host.records("read")).toMatchObject({ count: 1 });
  expect(yield* host.records("ownership")).toMatchObject({
    count: 1,
    shared: true,
    isolated: true,
    recovered: true,
  });
  expect(yield* host.records("descendants")).toMatchObject({ count: 1 });
  expect(yield* host.records("numeric")).toMatchObject({ count: 1, numeric: -1e100 });
  expect(yield* host.records("nested-auth")).toMatchObject({ count: 1, nested: true });
  yield* verifyNativeSession(host);
  expect((yield* host.read("releases.txt")).trim().split("\n")).toHaveLength(1);
  const stopped = yield* host.stop;
  expect(stopped.exitCode).toBe(0);
  expect((yield* host.read("releases.txt")).trim().split("\n")).toHaveLength(2);
  expect(stopped.output).not.toContain("host-password-123");
  expect(stopped.output).not.toContain("generated-host-test-secret-at-least-32-bytes");
});

/**
 * Exercises the mounted native auth route and protected application route through the actual server middleware.
 * @param host - Original scope-owned application operations with request-specific identity.
 * @returns Completion after unauthenticated denial, native signup, cookie session and authenticated admission.
 */
const verifyNativeSession = Effect.fn("GeneratedHost.verifySession")(function* (
  host: GeneratedHostSession,
) {
  const denied = yield* host.request("/account/profile");
  yield* scaffoldNative("generated.host.denied.body", () => denied.arrayBuffer());
  expect(denied.status).toBe(401);
  const signup = yield* host.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: host.baseURL,
    },
    body: JSON.stringify({
      name: "Generated Host",
      email: "host@example.com",
      password: "host-password-123",
    }),
  });
  const signupBody = yield* scaffoldNative("generated.host.signup.body", () => signup.text());
  expect(signup.status, signupBody).toBe(200);
  const cookie = signup.headers.get("set-cookie")?.split(";", 1)[0];
  expect(cookie).toContain("better-auth");
  const headers = { cookie: cookie ?? "" };
  const session = yield* host.request("/api/auth/get-session", { headers });
  expect(
    yield* generatedBody(session).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(GeneratedSessionResponse)),
    ),
  ).toMatchObject({ user: { email: "host@example.com" } });
  const profile = yield* host.request("/account/profile", { headers });
  expect(profile.status).toBe(200);
  expect(
    yield* generatedBody(profile).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(GeneratedProfileResponse)),
    ),
  ).toMatchObject({ authenticated: true });
});
