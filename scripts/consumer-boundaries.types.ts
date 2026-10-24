/**
 * Derives the serialized observation contract and declares the pure gate result.
 * Violations retain their original path; missing measurement remains explicit
 * rather than being represented by an empty successful observation.
 */
import type { Schema } from "effect";
import type { BoundaryObservation as ObservationSchema } from "./consumer-boundaries.schemas.js";
import type { DependencyBoundary, DependencyPath } from "./consumer-dependency-policy.types.js";

/** Validated observation from an independent consumer verification boundary. */
export interface BoundaryObservation extends Schema.Schema.Type<typeof ObservationSchema> {}

/** Gate result with completeness separate from forbidden-path findings. */
export interface ConsumerBoundaryResult {
  readonly passed: boolean;
  readonly incomplete: readonly DependencyBoundary[];
  readonly violations: readonly DependencyPath[];
}
