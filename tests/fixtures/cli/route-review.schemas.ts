/** Decodes the real CLI fields consumed by route-module acceptance without claiming authority over omitted native metadata. */
import { Schema } from "effect";

/** Public check status and diagnostic codes/messages used by the native route fixtures. */
export const RouteReviewResult = Schema.Struct({
  ok: Schema.Boolean,
  activatable: Schema.Boolean,
  graphHash: Schema.optionalKey(Schema.String),
  diagnostics: Schema.Array(
    Schema.Struct({
      code: Schema.String,
      message: Schema.String,
      severity: Schema.String,
      file: Schema.optionalKey(Schema.String),
    }),
  ),
});
