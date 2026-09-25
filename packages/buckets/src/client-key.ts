import { Cause, Effect, Exit } from "effect";
import { BucketValidationError } from "./bucket-validation-error.js";

/** Validate a portable object key in Effect.
 * @param value - Key to validate.
 * @returns Effect of void or BucketValidationError.
 * @example Effect.runSync(validateKeyEffect("images/logo.png"));
 */
export const validateKeyEffect = Effect.fn("bucket.validateKey")((value: string) =>
  validatePortableKeyEffect(value, false),
);

/** Validate a portable prefix in Effect.
 * @param value - Prefix to validate.
 * @returns Effect of void or BucketValidationError.
 * @example Effect.runSync(validatePrefixEffect("images/"));
 */
export const validatePrefixEffect = Effect.fn("bucket.validatePrefix")((value: string) =>
  validatePortableKeyEffect(value, true),
);

/** Validate nonempty identifying text in Effect.
 * @param value - Identifier text.
 * @param name - Field name for errors.
 * @returns Effect of void or BucketValidationError.
 * @example Effect.runSync(validateTextIdEffect("assets", "bucketId"));
 */
export const validateTextIdEffect = Effect.fn("bucket.validateTextId")(
  (value: string, name: string) =>
    Effect.try({
      try: () => {
        if (typeof value !== "string" || value.trim() === "")
          throw new TypeError(`Bucket ${name} must be non-empty`);
      },
      catch: validationError,
    }),
);

/** Synchronous compatibility key assertion.
 * @param value - Key to validate.
 * @returns Nothing when valid.
 * @throws TypeError when invalid.
 * @example assertKey("images/logo.png");
 */
export function assertKey(value: string): void {
  runKeySync(validateKeyEffect(value));
}

/** Synchronous compatibility prefix assertion.
 * @param value - Prefix to validate.
 * @returns Nothing when valid.
 * @throws TypeError when invalid.
 * @example assertPrefix("images/");
 */
export function assertPrefix(value: string): void {
  runKeySync(validatePrefixEffect(value));
}

/** Common portable path check shared by key and prefix Effects. */
const validatePortableKeyEffect = Effect.fn("bucket.validatePortableKey")(
  (value: string, prefix: boolean) =>
    Effect.try({
      try: () => {
        if (typeof value !== "string") throw new TypeError("Bucket key must be a string");
        if (prefix && value === "") return;
        const segments = value.split("/");
        const invalidSegment = segments.some(
          (segment, index) =>
            (segment === "" && !(prefix && index === segments.length - 1)) ||
            segment === "." ||
            segment === "..",
        );
        if (
          value.includes("\0") ||
          value.includes("\\") ||
          value.startsWith("/") ||
          /^[A-Za-z]:/.test(value) ||
          new TextEncoder().encode(value).byteLength > 4_096 ||
          invalidSegment ||
          segments[0]?.startsWith(".relkit") ||
          segments[0]?.startsWith("__relkit")
        )
          throw new TypeError("Bucket key is invalid");
      },
      catch: validationError,
    }),
);

function validationError(cause: unknown): BucketValidationError {
  return new BucketValidationError({
    message: cause instanceof Error ? cause.message : String(cause),
  });
}

function runKeySync(effect: Effect.Effect<void, BucketValidationError>): void {
  const exit = Effect.runSyncExit(effect);
  if (Exit.isSuccess(exit)) return;
  const cause = Cause.squash(exit.cause);
  if (cause instanceof BucketValidationError) throw new TypeError(cause.message);
  throw cause;
}
