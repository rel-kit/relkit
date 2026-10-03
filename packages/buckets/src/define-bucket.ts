import {
  createDescriptorBaseEffect,
  deepFreezeEffect,
  isDescriptor,
  normalizeId,
  normalizeIdEffect,
} from "@relkit/contracts";
import { Cause, Effect, Exit } from "effect";
import { BucketValidationError } from "./bucket-validation-error.js";
import { observeBucket } from "./client-observability.js";
import type {
  BucketDescriptor,
  BucketDescriptorAny,
  DefineBucketOptions,
} from "./define-bucket.types.js";

export type * from "./define-bucket.types.js";
export { BucketValidationError } from "./bucket-validation-error.js";

const CONTENT_TYPE = /^(?:[A-Za-z0-9!#$&^_.+-]+|\*)\/(?:[A-Za-z0-9!#$&^_.+-]+|\*)$/;

/** Defines a managed object store with explicit visibility and bounded upload policy.
 * @param options - Bucket identity, visibility, and upload policy.
 * @returns A frozen bucket descriptor.
 * @throws TypeError when the authoring input is invalid.
 * @example
 * ```ts
 * import { defineBucket } from "@relkit/buckets";
 * const assets = defineBucket({
 *   id: "assets", visibility: "public", maxObjectBytes: 1_048_576,
 * });
 * ```
 * @category Resources
 * @since 0.1.0
 */
export function defineBucket<const Id extends string>(
  options: DefineBucketOptions<Id>,
): BucketDescriptor<Id> {
  return runBucketSync(defineBucketEffect(options));
}

/** Defines a bucket in Effect, exposing invalid input as a tagged error.
 * @param options - Bucket identity, visibility, and upload policy.
 * @returns Effect of a frozen descriptor or BucketValidationError.
 * @example Effect.runSync(defineBucketEffect({ id: "assets", visibility: "private" }));
 */
export const defineBucketEffect = Effect.fn("bucket.define")(
  <const Id extends string>(options: DefineBucketOptions<Id>) =>
    observeBucket(
      "define",
      Effect.gen(function* () {
        if (options === null || typeof options !== "object" || Array.isArray(options))
          return yield* new BucketValidationError({ message: "Bucket options must be an object" });
        if (Object.prototype.hasOwnProperty.call(options, "handler"))
          return yield* new BucketValidationError({ message: "Buckets cannot own handlers" });
        const visibility = options.visibility;
        if (visibility !== "private" && visibility !== "public")
          return yield* new BucketValidationError({
            message: "Bucket visibility must be private or public",
          });
        const profileInput = options.profile;
        const profile =
          profileInput === undefined
            ? undefined
            : yield* Effect.mapError(normalizeIdEffect(profileInput), bucketValidationError);
        const maxObjectBytes = options.maxObjectBytes;
        if (
          maxObjectBytes !== undefined &&
          (!Number.isSafeInteger(maxObjectBytes) || maxObjectBytes <= 0)
        )
          return yield* new BucketValidationError({
            message: "maxObjectBytes must be a positive integer",
          });
        let allowedContentTypes: readonly string[] | undefined;
        const contentTypes = options.allowedContentTypes;
        if (contentTypes !== undefined) {
          if (!Array.isArray(contentTypes))
            return yield* new BucketValidationError({
              message: "Bucket allowedContentTypes must be an array",
            });
          if (contentTypes.length === 0)
            return yield* new BucketValidationError({
              message: "Bucket allowedContentTypes must not be empty",
            });
          const types: string[] = [];
          for (const contentType of contentTypes) {
            if (typeof contentType !== "string" || !CONTENT_TYPE.test(contentType.trim()))
              return yield* new BucketValidationError({
                message: `Invalid bucket content type "${String(contentType)}"`,
              });
            types.push(contentType.trim());
          }
          if (new Set(types).size !== types.length)
            return yield* new BucketValidationError({
              message: "Bucket allowedContentTypes must be unique",
            });
          allowedContentTypes = Object.freeze(types);
        }
        const base = yield* Effect.mapError(
          createDescriptorBaseEffect("bucket", options.id, options),
          bucketValidationError,
        );
        return (yield* deepFreezeEffect({
          ...base,
          visibility,
          ...(profile === undefined ? {} : { profile }),
          ...(maxObjectBytes === undefined ? {} : { maxObjectBytes }),
          ...(allowedContentTypes === undefined ? {} : { allowedContentTypes }),
        })) as BucketDescriptor<Id>;
      }),
    ),
);

/** Convert a known stable ID validation failure to the bucket error channel. */
function bucketValidationError(cause: Error): BucketValidationError {
  return new BucketValidationError({ message: cause.message });
}

/** Checks whether a value is a well-formed bucket descriptor.
 * @param value - Untrusted value to inspect.
 * @returns True for a valid descriptor.
 * @example isBucketDescriptor(defineBucket({ id: "assets", visibility: "private" }));
 */
export function isBucketDescriptor(value: unknown): value is BucketDescriptorAny {
  return Effect.runSync(isBucketDescriptorEffect(value));
}

/** Effectful descriptor predicate for composition inside workflows.
 * @param value - Untrusted value to inspect.
 * @returns Effect of a boolean; unexpected getters can defect.
 * @example Effect.runSync(isBucketDescriptorEffect({}));
 */
export const isBucketDescriptorEffect = Effect.fn("bucket.isDescriptor")((value: unknown) =>
  observeBucket(
    "isDescriptor",
    Effect.sync(() => {
      if (
        value === null ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        !isDescriptor(value, "bucket")
      )
        return false;
      const descriptor = value as BucketDescriptorAny;
      let profileValid = true;
      if (descriptor.profile !== undefined) {
        try {
          normalizeId(descriptor.profile);
        } catch {
          profileValid = false;
        }
      }
      const allowed = descriptor.allowedContentTypes;
      return (
        profileValid &&
        (descriptor.visibility === "private" || descriptor.visibility === "public") &&
        (descriptor.maxObjectBytes === undefined ||
          (Number.isSafeInteger(descriptor.maxObjectBytes) && descriptor.maxObjectBytes > 0)) &&
        (allowed === undefined ||
          (Array.isArray(allowed) &&
            allowed.length > 0 &&
            new Set(allowed).size === allowed.length &&
            allowed.every(
              (contentType) => typeof contentType === "string" && CONTENT_TYPE.test(contentType),
            )))
      );
    }),
  ),
);

/** Narrows a value to BucketDescriptorAny or throws a compatibility TypeError.
 * @param value - Untrusted value to assert.
 * @returns Nothing after successful validation.
 * @throws TypeError when value is invalid.
 * @example assertBucketDescriptor(defineBucket({ id: "assets", visibility: "private" }));
 */
export function assertBucketDescriptor(value: unknown): asserts value is BucketDescriptorAny {
  runBucketSync(assertBucketDescriptorEffect(value));
}

/** Validates a bucket descriptor with a tagged Effect failure.
 * @param value - Untrusted value to assert.
 * @returns Effect of void or BucketValidationError.
 * @example Effect.runSync(assertBucketDescriptorEffect(defineBucket({ id: "a", visibility: "private" })));
 */
export const assertBucketDescriptorEffect = Effect.fn("bucket.assertDescriptor")((value: unknown) =>
  observeBucket(
    "assertDescriptor",
    Effect.flatMap(isBucketDescriptorEffect(value), (valid) =>
      valid
        ? Effect.void
        : Effect.fail(new BucketValidationError({ message: "Invalid bucket descriptor" })),
    ),
  ),
);

/** Preserve legacy TypeError behavior at the synchronous authoring boundary. */
function runBucketSync<A>(effect: Effect.Effect<A, BucketValidationError>): A {
  const exit = Effect.runSyncExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const error = Cause.squash(exit.cause);
  if (error instanceof BucketValidationError) throw new TypeError(error.message);
  throw error;
}
