/** Decodes the authoritative successful native compiler JSON before granting graph comparison authority. */
import { Schema } from "effect";

/** Complete native success fields required by paired runtime/graph acceptance; unrelated CLI output is not rewritten. */
export const CheckedCommerceApplication = Schema.Struct({
  ok: Schema.Literal(true),
  activatable: Schema.Literal(true),
  graphHash: Schema.String,
  outputs: Schema.Struct({ graph: Schema.String }),
});
