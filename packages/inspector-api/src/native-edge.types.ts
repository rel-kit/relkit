import type { InspectorBoundaryError } from "./native-edge.js";
import type { InspectorActionError } from "./actions-errors.js";
import type { InspectorEndpointError } from "./router-utils.js";
import type { InspectorRuntimeError } from "./runtime.js";
import type { InspectorJobsError } from "./jobs/types.js";

/** Expected query failures; compatibility edges restore any retained native cause. */
export type InspectorQueryFailure =
  InspectorBoundaryError | InspectorEndpointError | InspectorRuntimeError | InspectorJobsError;

/** Expected action failures while preserving native generation-authority failures. */
export type InspectorControlFailure = InspectorBoundaryError | InspectorActionError;

/** Expected observation query/acquisition failures. */
export type InspectorObservationFailure = InspectorBoundaryError | InspectorEndpointError;
