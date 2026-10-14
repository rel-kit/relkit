/** Uses the existing native typed protocol fixture client against actual generated network listeners and scope-owned realtime iterators. */
import { Effect, Schema } from "effect";
import { createFixtureClient } from "../../../packages/runtime-hono/tests/fixture-client.js";
import { generatedBody } from "./generated-host-http.js";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";
import { ProtectedIdentity } from "./generated-protection.schemas.js";
import type { ProtectedUser } from "./generated-protection.types.js";
import type { GeneratedHostSession } from "./generated-host.types.js";

/**
 * Binds actual issued session identity to the SDK's existing native client protocol without an in-memory fetch adapter.
 * @param host - Actual caller-owned generated listener.
 * @param user - Real local user or anonymous absence.
 * @returns Native typed protocol client using real loopback HTTP.
 */
export const protectionClient = Effect.fn("GeneratedProtection.client")(function* (
  host: GeneratedHostSession,
  user?: ProtectedUser,
) {
  const identity = user ?? (yield* anonymousIdentity(host));
  const cookie = identity.cookie;
  return createFixtureClient({
    baseUrl: host.baseURL,
    headers: {
      origin: host.baseURL,
      ...(cookie ? { cookie } : {}),
      "x-relkit-identity-scope": identity.identityScope,
      "x-relkit-session-epoch": identity.sessionEpoch,
    },
  });
});

/** Reads the native anonymous identity together with its issued scope cookie.
 * @param host - Actual generated listener.
 * @returns Validated identity and native anonymous cookie for subsequent requests.
 */
const anonymousIdentity = Effect.fn("GeneratedProtection.anonymous")(function* (
  host: GeneratedHostSession,
) {
  const response = yield* host.request("/_relkit/v1/client/identity");
  const identity = yield* generatedBody(response).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(ProtectedIdentity)),
  );
  return { ...identity, cookie: response.headers.get("set-cookie")?.split(";", 1)[0] };
});

/**
 * Opens one actual protected stream and owns native cancellation before joining iterator return.
 * @param host - Original generated listener.
 * @param user - Actual session observer.
 * @param params - Requested native subject partition.
 * @param channel - Public or deliberately internal channel identity.
 * @param after - Original validated checkpoint used only for replay.
 * @returns Caller-scoped native iterator with a finite transport deadline.
 */
export const protectedIterator = Effect.fn("GeneratedProtection.iterator")(function* (
  host: GeneratedHostSession,
  user: ProtectedUser | undefined,
  params: Pick<ProtectedUser, "ownerId" | "tenant">,
  channel = "ownership.feed",
  after?: Readonly<Record<string, Schema.Json>>,
) {
  const client = yield* protectionClient(host, user);
  const controller = yield* Effect.acquireRelease(
    Effect.sync(() => new AbortController()),
    (controller) => Effect.sync(() => controller.abort()),
  );
  const stream = yield* scaffoldNative("protection.stream.open", () =>
    client["relkit.realtime.subscribe"](
      { channel, params, ...(after ? { after } : {}) },
      { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]) },
    ),
  );
  return yield* Effect.acquireRelease(
    Effect.sync(() => stream[Symbol.asyncIterator]()),
    (iterator) =>
      scaffoldNative("protection.stream.close", async () => {
        controller.abort();
        await iterator.return?.();
      }).pipe(Effect.orDie),
  );
});

/**
 * Reads bounded native frames without widening their data or replacing their checkpoint.
 * @param iterator - Original scope-owned native iterator.
 * @param kind - Required public frame kind.
 * @returns Complete native JSON frame after protocol validation.
 */
export const protectedFrame = Effect.fn("GeneratedProtection.frame")(function* (
  iterator: AsyncIterator<{ readonly kind: string }>,
  kind: string,
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const item = yield* scaffoldNative("protection.stream.next", () => iterator.next());
    if (item.done) throw new Error("Native stream ended before its expected frame");
    const frame = yield* Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.Json))(
      item.value,
    );
    if (frame.kind === kind) return frame;
  }
  throw new Error("Native stream exceeded its finite frame bound");
});
