import { Schema } from "effect";

/** Expected malformed service input or dependency rejection in an Effect operation.
 * @param fields - Stable message and optional original failure for compatibility adapters.
 * @example Effect.catchTag(defineServiceEffect(input), "ServiceValidationError", () => Effect.void);
 */
export class ServiceValidationError extends Schema.TaggedError<ServiceValidationError>()(
  "ServiceValidationError",
  { message: Schema.String, cause: Schema.optionalKey(Schema.Unknown) },
) {}
