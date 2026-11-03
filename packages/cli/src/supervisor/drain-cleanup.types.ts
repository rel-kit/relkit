import type { SupervisorDrainCleanupStatus } from "./drain.types.js";

/** Native cleanup evidence with a bounded optional failure message. */
export interface SupervisorDrainCleanupResult {
  readonly status: SupervisorDrainCleanupStatus;
  readonly message?: string;
}
