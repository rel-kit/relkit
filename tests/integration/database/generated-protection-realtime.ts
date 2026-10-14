/** Verifies actual protected/internal channel exposure, partition grants, replay, presence cleanup and fresh-session revocation in either source layout. */
import { expect } from "bun:test";
import { Effect, Schema } from "effect";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";
import { protectedIterator, protectedFrame } from "./generated-protection-client.js";
import { ProtectedEventFrame, ProtectedPresenceFrame } from "./generated-protection.schemas.js";
import { requestProtectedSubject } from "./generated-protection-user.js";
import type { GeneratedHostSession } from "./generated-host.types.js";
import type { ProtectedUser } from "./generated-protection.types.js";

/**
 * Exercises the real server's public protocol using actual authenticated and foreign subjects.
 * @param host - Caller-owned generated listener.
 * @param alice - Actual owner session.
 * @param bob - Different real user session in the same tenant.
 * @returns Completion after denial, original event replay, presence release and revoked-cookie denial.
 */
export const verifyProtectedRealtime = Effect.fn("GeneratedProtection.realtime")(function* (
  host: GeneratedHostSession,
  alice: ProtectedUser,
  bob: ProtectedUser,
) {
  for (const [actor, subject, channel, code] of [
    [undefined, alice, "ownership.feed", "NOT_FOUND"],
    [bob, alice, "ownership.feed", "NOT_FOUND"],
    [alice, { ...alice, tenant: "tenant-b.test" }, "ownership.feed", "NOT_FOUND"],
    [alice, alice, "ownership.internal", "NOT_FOUND"],
  ] as const) {
    yield* Effect.scoped(
      Effect.gen(function* () {
        const iterator = yield* protectedIterator(host, actor, subject, channel);
        yield* scaffoldNative("protection.stream.denied", async () => {
          await expect(iterator.next()).rejects.toMatchObject({ code });
        });
      }),
    );
  }
  const first = yield* observeProtectedEvent(host, alice, "first");
  yield* awaitReleasedPresence(host, alice);
  yield* publishProtectedEvent(host, alice, "second");
  yield* Effect.scoped(
    Effect.gen(function* () {
      const replay = yield* protectedIterator(
        host,
        alice,
        alice,
        "ownership.feed",
        first.checkpoint,
      );
      const event = yield* protectedFrame(replay, "event").pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(ProtectedEventFrame)),
      );
      expect(event.payload.message).toBe("second");
    }),
  );
  yield* verifyRevokedChannel(host, alice);
});

/** Observes actual server-side cancellation completion without assuming synchronous network delivery.
 * @param host - Original native listener.
 * @param owner - Current subject owner.
 * @returns Completion only after the provider reports release inside the finite cancellation deadline.
 */
const awaitReleasedPresence = Effect.fn("GeneratedProtection.presence.released")(function* (
  host: GeneratedHostSession,
  owner: ProtectedUser,
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = yield* requestProtectedSubject(host, "presence", owner, owner);
    expect(result.status).toBe(200);
    if (result.body === '{"connections":0}') return;
    yield* Effect.sleep(25);
  }
  throw new Error("Actual cancelled channel stream retained its native presence lease");
});

/**
 * Uses original native publication under the real HTTP middleware and session context.
 * @param host - Actual listener.
 * @param owner - Current owner session.
 * @param message - Controlled native event body.
 * @returns Completion after validated publication and complete response consumption.
 */
export const publishProtectedEvent = Effect.fn("GeneratedProtection.publish")(function* (
  host: GeneratedHostSession,
  owner: ProtectedUser,
  message: string,
) {
  const response = yield* host.request("/ownership/publish", {
    method: "POST",
    headers: { cookie: owner.cookie, origin: host.baseURL, "content-type": "application/json" },
    body: JSON.stringify({ ownerId: owner.ownerId, tenant: owner.tenant, message }),
  });
  const body = yield* scaffoldNative("protection.publish.body", () => response.text());
  expect({ status: response.status, body }).toEqual({ status: 200, body: '{"accepted":true}' });
});

/**
 * Proves original presence acquisition, original event data and checkpoint retention before caller-scope release.
 * @param host - Actual listener.
 * @param owner - Current subject owner.
 * @param message - Controlled first event body.
 * @returns The original validated event checkpoint after the iterator scope closes.
 */
const observeProtectedEvent = Effect.fn("GeneratedProtection.observe")(
  function* (host: GeneratedHostSession, owner: ProtectedUser, message: string) {
    const iterator = yield* protectedIterator(host, owner, owner);
    const presence = yield* protectedFrame(iterator, "presence").pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(ProtectedPresenceFrame)),
    );
    expect(presence.presence.connections).toBe(1);
    yield* publishProtectedEvent(host, owner, message);
    const event = yield* protectedFrame(iterator, "event").pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(ProtectedEventFrame)),
    );
    expect(event.payload.message).toBe(message);
    return event;
  },
  (effect) => effect.pipe(Effect.scoped),
);

/**
 * Revokes an actual cookie session and proves the old identity cannot reconnect.
 * @param host - Actual listener.
 * @param owner - Session whose native database record is revoked.
 * @returns Completion after sign-out and native identity-precondition denial.
 */
const verifyRevokedChannel = Effect.fn("GeneratedProtection.revoke")(function* (
  host: GeneratedHostSession,
  owner: ProtectedUser,
) {
  const response = yield* host.request("/api/auth/sign-out", {
    method: "POST",
    headers: { cookie: owner.cookie, origin: host.baseURL },
  });
  yield* scaffoldNative("protection.signout.body", () => response.arrayBuffer());
  expect(response.status).toBe(200);
  yield* Effect.scoped(
    Effect.gen(function* () {
      const iterator = yield* protectedIterator(host, owner, owner);
      yield* scaffoldNative("protection.stream.revoked", async () => {
        await expect(iterator.next()).rejects.toMatchObject({
          code: "IDENTITY_PRECONDITION_FAILED",
        });
      });
    }),
  );
});
