/** Decodes explicit Stage 1 benchmark reports without treating installation as other boundary evidence. */
import { Schema } from "effect";

/** Only actual warm successful roots from Stage 1 are eligible for later probes. */
export const RetainedWarmReport = Schema.Struct({
  stage: Schema.Literals(["1"]),
  result: Schema.NullOr(
    Schema.Struct({
      samples: Schema.Array(
        Schema.Struct({
          fixture: Schema.String,
          manager: Schema.String,
          condition: Schema.String,
          failure: Schema.NullOr(Schema.String),
          root: Schema.String,
        }),
      ),
    }),
  ),
});

/** Explicit bounded report paths; this input supplies no selected SDK or inspector admissions. */
export const RetainedBoundaryInputs = Schema.Struct({ reports: Schema.Array(Schema.String) });
