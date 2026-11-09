import type { BucketClientOptions, BucketProvider } from "./client.types.js";

/** Provider and invocation configuration supplied to bucket Effects.
 * @example const runtime: BucketRuntimeService = { options, provider };
 */
export interface BucketRuntimeService {
  readonly options: BucketClientOptions;
  readonly provider: BucketProvider;
  readonly bridgeOwned?: boolean;
}
