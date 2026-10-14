/** Describes the real generated host's visible lifecycle, session and profile observations. */
import { Schema } from "effect";

/** Native transaction and ownership observations; every mode retains its actual returned fields. */
export const GeneratedRecordResponse = Schema.Struct({
  count: Schema.Number,
  shared: Schema.optionalKey(Schema.Boolean),
  isolated: Schema.optionalKey(Schema.Boolean),
  recovered: Schema.optionalKey(Schema.Boolean),
  numeric: Schema.optionalKey(Schema.Number),
  nested: Schema.optionalKey(Schema.Boolean),
});
/** Request-specific authenticated identity returned by the mounted native auth API. */
export const GeneratedSessionResponse = Schema.Struct({
  user: Schema.Struct({ email: Schema.String }),
});
/** Protected profile response after native session middleware admission. */
export const GeneratedProfileResponse = Schema.Struct({ authenticated: Schema.Boolean });
