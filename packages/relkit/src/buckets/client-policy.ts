import { Effect } from "effect";
import {
  assertWriteUrlAllowed,
  bucketPolicyViolation,
  BucketPolicyError,
  normalizeBucketPolicy,
  normalizeWriteUrlOptions,
} from "./bucket-policy.js";
import { BucketRuntime } from "./client-runtime.js";
import type { BucketWriteUrlOptions } from "./client-provider.types.js";

/** Captures a thrown policy failure in the typed channel. */
const policyFailure = (cause: unknown): BucketPolicyError =>
  cause instanceof BucketPolicyError ? cause : new BucketPolicyError(String(cause));

/** Refuses an object the client's declared bucket policy does not allow, before the provider.
 * @param object - The object's size and content type.
 * @returns Effect of void, or BucketPolicyError naming the failed rule.
 * @example Effect.provide(checkPutPolicyEffect({ size: 3, contentType: "text/plain" }), layer);
 */
export const checkPutPolicyEffect = Effect.fn("bucket.checkPolicy")(function* (object: {
  readonly size: number;
  readonly contentType?: string;
}) {
  const { options } = yield* BucketRuntime;
  if (options.policy === undefined) return;
  const policy = yield* Effect.try({
    try: () => normalizeBucketPolicy(options.policy!),
    catch: policyFailure,
  });
  const violation = bucketPolicyViolation(policy, object);
  if (violation !== undefined) return yield* Effect.fail(new BucketPolicyError(violation));
});

/** Validates a signed upload declaration and checks it against the declared policy.
 * @param options - Content type and length the caller declared, if any.
 * @returns Effect of the normalized declaration, or BucketPolicyError before any URL is signed.
 * @example Effect.provide(writeUrlOptionsEffect({ contentType: "image/png" }), layer);
 */
export const writeUrlOptionsEffect = Effect.fn("bucket.writeUrlOptions")(function* (
  options: BucketWriteUrlOptions | undefined,
) {
  const { options: client } = yield* BucketRuntime;
  return yield* Effect.try({
    try: () =>
      client.policy === undefined
        ? normalizeWriteUrlOptions(options)
        : assertWriteUrlAllowed(normalizeBucketPolicy(client.policy), options),
    catch: policyFailure,
  });
});
