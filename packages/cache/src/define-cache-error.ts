import { Schema } from "effect";
/** Invalid descriptor input, with its original cause when a dependency threw.
 * @param fields - Stable reason and optional original cause.
 * @example new CacheDescriptorError({ reason: "Invalid cache descriptor" });
 */
export class CacheDescriptorError extends Schema.TaggedError<CacheDescriptorError>()(
  "CacheDescriptorError",
  { reason: Schema.String, cause: Schema.optional(Schema.Defect()) },
) {
  override get message(): string {
    return this.reason;
  }
}
