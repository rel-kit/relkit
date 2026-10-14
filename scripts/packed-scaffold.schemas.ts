/** Decodes only the public packed creation and migration fields used by external acceptance. */
import { Schema } from "effect";

/** Destination returned by a successful public generator invocation. */
export const PackedCreation = Schema.Struct({ destination: Schema.String });
/** Public migration result; receipt authority is required only for committed publication. */
export const PackedMigration = Schema.Struct({
  ok: Schema.Boolean,
  status: Schema.Literals(["preview", "noop", "committed", "rolled-back", "refused"]),
  verification: Schema.Literals(["not-run", "passed"]),
  receipt: Schema.optionalKey(Schema.String),
});
