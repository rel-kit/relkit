/**
 * Combines the four independent boundary observations without substituting
 * installation success for executable, declaration or production proof. This
 * pure gate validates labels and applies the exact measured stage policy.
 */
import { dependencyViolations } from "./consumer-dependency-policy.js";
import type {
  ConsumerDependencyPolicy,
  DependencyBoundary,
} from "./consumer-dependency-policy.types.js";
import type { BoundaryObservation, ConsumerBoundaryResult } from "./consumer-boundaries.types.js";

/**
 * Requires complete evidence and permitted paths at every consumer boundary.
 * @param observations - Independently produced boundary evidence references.
 * @param policy - Stage-specific measured admissions.
 * @returns Completeness and forbidden-path results, with a combined verdict.
 * @throws When duplicated observations or mislabeled paths make evidence ambiguous.
 */
export function checkConsumerBoundaries(
  observations: readonly BoundaryObservation[],
  policy: ConsumerDependencyPolicy,
): ConsumerBoundaryResult {
  const boundaries: readonly DependencyBoundary[] = [
    "installation",
    "evaluation",
    "declarations",
    "artifact",
  ];
  const seen = new Set<DependencyBoundary>();
  for (const observation of observations) {
    if (seen.has(observation.boundary))
      throw new Error(`Duplicate boundary: ${observation.boundary}`);
    if (observation.paths.some((path) => path.boundary !== observation.boundary))
      throw new Error(`Mislabeled boundary path: ${observation.boundary}`);
    seen.add(observation.boundary);
  }
  const incomplete = boundaries.filter(
    (boundary) =>
      !observations.some(
        (item) => item.boundary === boundary && item.complete && item.evidence.trim() !== "",
      ),
  );
  const violations = dependencyViolations(
    observations.flatMap((observation) => observation.paths),
    policy,
  );
  return { passed: incomplete.length === 0 && violations.length === 0, incomplete, violations };
}
