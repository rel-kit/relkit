/** Describes independently collected raw evidence from one retained consumer root. */
import type { BoundaryObservation } from "./consumer-boundaries.types.js";

/** Raw four-boundary observations, with no combined passing verdict or SDK admission. */
export interface RetainedBoundaryResult {
  readonly fixture: string;
  readonly manager: string;
  readonly root: string;
  readonly evidence: string;
  readonly observations: readonly BoundaryObservation[];
}
