import { Cause, Context, Effect, Exit, Layer } from "effect";
import { BucketProviderError } from "./client-errors.js";
import { observeBucket } from "./client-observability.js";
import type { BucketRuntimeService } from "./client-runtime.types.js";
import type { BucketClientOptions, BucketProvider } from "./client.types.js";

/** Injectable provider and invocation configuration.
 * @example Effect.provide(getBucketEffect("a"), bucketRuntimeLayer(options));
 */
export class BucketRuntime extends Context.Service<BucketRuntime, BucketRuntimeService>()(
  "relkit/buckets/BucketRuntime",
) {}

/** Creates a live runtime Layer from compatibility client options.
 * @param options - Provider and invocation options.
 * @returns A Layer supplying BucketRuntime; malformed source fails on acquisition.
 * @example bucketRuntimeLayer({ ownerId: "job", bucketId: "assets", source: {} });
 */
export function bucketRuntimeLayer(options: BucketClientOptions) {
  return Layer.effect(
    BucketRuntime,
    Effect.map(asProviderEffect(options.source), (provider) =>
      BucketRuntime.of({ options, provider }),
    ),
  );
}

/** Converts an optional source to a provider in Effect.
 * @param value - Provider source.
 * @returns Effect of a provider or BucketProviderError.
 * @example Effect.runSync(asProviderEffect(undefined));
 */
export const asProviderEffect = Effect.fn("bucket.asProvider")((value: unknown) =>
  observeBucket(
    "asProvider",
    Effect.gen(function* () {
      if (value === undefined) return {};
      if (value === null || typeof value !== "object") return yield* new BucketProviderError("put");
      return value as BucketProvider;
    }),
  ),
);

/** Converts an optional source to a provider while retaining legacy validation.
 * @param value - Provider source.
 * @returns Provider object, or an empty provider when absent.
 * @throws BucketProviderError for non-object sources.
 * @example asProvider(undefined);
 */
export function asProvider(value: unknown): BucketProvider {
  const exit = Effect.runSyncExit(asProviderEffect(value));
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}
