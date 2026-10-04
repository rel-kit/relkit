import type { MaybePromise } from "@relkit/contracts";

/** Native owner release callbacks registered immediately after fixture acquisition. */
export interface CompatibilityRelease {
  readonly release: () => MaybePromise<void>;
}
