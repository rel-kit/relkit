import { Schema } from "effect";

/** Invalid bucket authoring input, retained in the Effect error channel.
 * @param fields - Message describing the invalid input.
 * @example Effect.catchTag(defineBucketEffect(input), "BucketValidationError", () => Effect.void);
 */
export class BucketValidationError extends Schema.TaggedError<BucketValidationError>()(
  "BucketValidationError",
  { message: Schema.String },
) {}
