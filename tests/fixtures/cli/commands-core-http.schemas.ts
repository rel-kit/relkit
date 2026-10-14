/** Decodes native Inspector log pagination fields used by the production-start acceptance fixture. */
import { Schema } from "effect";

/** Native log rows keep identity and visible message fields needed by the real HTTP assertions. */
export const CommandLogPage = Schema.Struct({
  items: Schema.Array(
    Schema.Struct({
      invocationId: Schema.String,
      component: Schema.String,
      message: Schema.String,
    }),
  ),
  nextCursor: Schema.optionalKey(Schema.String),
});
