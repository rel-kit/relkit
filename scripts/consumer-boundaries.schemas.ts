/**
 * Decodes independent consumer evidence supplied to the dependency gate.
 * A missing or explicitly incomplete boundary cannot be inferred from another
 * observation, even when all its recorded paths happen to be allowed.
 */
import { Schema } from "effect";

/** Four independently observed consumer surfaces. */
export const DependencyBoundary = Schema.Literals([
  "installation",
  "evaluation",
  "declarations",
  "artifact",
]);

/** Complete package path and optional exact bundled-file identity. */
export const DependencyPath = Schema.Struct({
  boundary: DependencyBoundary,
  packages: Schema.Array(Schema.String),
  artifact: Schema.optionalKey(Schema.String),
});

/** One boundary's result with an evidence reference and explicit completeness. */
export const BoundaryObservation = Schema.Struct({
  boundary: DependencyBoundary,
  complete: Schema.Boolean,
  evidence: Schema.String,
  paths: Schema.Array(DependencyPath),
});

/** Serializable stage policy containing exact expanded path admissions. */
export const ConsumerDependencyPolicy = Schema.Struct({
  stage: Schema.Literals(["baseline", "1", "final"]),
  exceptions: Schema.Array(DependencyPath),
  selected: Schema.optionalKey(Schema.Array(DependencyPath)),
});

/** Input document accepted by the independent-boundary executable. */
export const ConsumerBoundaryEvidence = Schema.Struct({
  policy: ConsumerDependencyPolicy,
  observations: Schema.Array(BoundaryObservation),
});

/** Raw footprint samples supply installation evidence only, never other boundaries. */
export const ConsumerMeasuredEvidence = Schema.Struct({
  stage: Schema.Literals(["baseline", "1", "final"]),
  result: Schema.NullOr(
    Schema.Struct({
      samples: Schema.Array(
        Schema.Struct({
          installation: Schema.NullOr(
            Schema.Struct({
              paths: Schema.Array(DependencyPath),
              missing: Schema.Array(Schema.Json),
            }),
          ),
        }),
      ),
    }),
  ),
});
