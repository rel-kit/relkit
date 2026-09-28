import { createHash } from "node:crypto";
import { canonicalJson } from "@relkit/contracts";
import { Effect } from "effect";
import type { ProviderRealtimeDispatcherOptions } from "./provider-dispatcher.types.js";
import { RealtimeProviderError } from "./realtime-errors.js";
import { observeRealtime } from "./realtime-observability.js";
/** Hashes canonical JSON for partitions and idempotency.
 * @param value - Canonically serializable value.
 * @returns An Effect of a SHA-256 digest or RealtimeProviderError.
 * @example Effect.runSync(digestEffect({ id: "one" }));
 */
export const digestEffect = Effect.fn("Realtime.providerDigest")(
  function* (value: unknown) {
    return yield* Effect.try({
      try: () => `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`,
      catch: (cause) => new RealtimeProviderError({ operation: "provider.digest", cause }),
    });
  },
  (effect) => observeRealtime("provider.digest", effect),
);
/** Measures an encoded event envelope.
 * @param value - JSON-serializable event envelope.
 * @returns An Effect of UTF-8 bytes or RealtimeProviderError.
 * @example Effect.runSync(encodedBytesEffect({ event: "posted" }));
 */
export const encodedBytesEffect = Effect.fn("Realtime.providerBytes")(
  function* (value: unknown) {
    return yield* Effect.try({
      try: () => new TextEncoder().encode(JSON.stringify(value)).byteLength,
      catch: (cause) => new RealtimeProviderError({ operation: "provider.bytes", cause }),
    });
  },
  (effect) => observeRealtime("provider.bytes", effect),
);
/** Computes the immutable portion of a provider scope.
 * @param options - Dispatcher generation options.
 * @param channelId - Validated channel ID.
 * @param profile - Resolved profile name.
 * @param params - Validated channel parameters.
 * @returns An Effect of scope fields or RealtimeProviderError.
 * @example Effect.runSync(providerScopeEffect(options, "news", "default", {}));
 */
export const providerScopeEffect = Effect.fn("Realtime.providerScope")(
  function* (
    options: ProviderRealtimeDispatcherOptions,
    channelId: string,
    profile: string,
    params: unknown,
  ) {
    return {
      applicationId: options.applicationId,
      environment: options.environment,
      channelId,
      partition: yield* digestEffect(params),
      profile,
      policyEpoch: options.publicFingerprint,
      providerEpoch: "",
      identityScope: `runtime:${options.generationId}`,
      sessionEpoch: options.generationId,
    };
  },
  (effect) => observeRealtime("provider.scope", effect),
);
