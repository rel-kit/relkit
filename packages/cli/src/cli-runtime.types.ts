import type { CliIo } from "./main-support-types.js";

/** Optional terminal boundary policy for otherwise object-less cleanup receipts. */
export interface CliCleanupPresentation {
  readonly json: boolean;
  readonly io: CliIo;
}
