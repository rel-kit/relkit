import { Schema } from "effect";

/** An expected graph projection failure with a stable reason and diagnostic message.
 * @example if (error._tag === "OpenApiGenerationError") console.error(error.message);
 */
export class OpenApiGenerationError extends Schema.TaggedError<OpenApiGenerationError>()(
  "OpenApiGenerationError",
  {
    reason: Schema.Literals(["missing-function", "duplicate-route"]),
    message: Schema.String,
    triggerId: Schema.optionalKey(Schema.String),
    targetFunctionId: Schema.optionalKey(Schema.String),
    method: Schema.optionalKey(Schema.String),
    path: Schema.optionalKey(Schema.String),
  },
) {}
