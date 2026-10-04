import type { measure } from "./performance-support.js";

/** Distribution produced by the repository's shared performance protocol. */
export type ConsumerMeasurement = Awaited<ReturnType<typeof measure>>;

/** Resource totals across measured and warm-up watch batches. */
export interface WatchResourceCounts {
  opened: number;
  returned: number;
  active: number;
  peakActive: number;
  connectedLeases: number;
  disposedLeases: number;
}

/** Shared-watch distribution and native resource reconciliation. */
export interface WatchMeasurement {
  readonly latency: ConsumerMeasurement;
  readonly resources: WatchResourceCounts;
  readonly feedsPerBatch: 100;
  readonly leasesPerBatch: 1_000;
}

/** Distributions of authorized Inspector reads and real loopback proxy requests. */
export interface RouteMeasurements {
  readonly inspectorQuery: ConsumerMeasurement;
  readonly supervisorProxy: ConsumerMeasurement;
  readonly candidateActivation: ConsumerMeasurement;
  readonly inspectorReads: number;
  readonly proxyRequests: number;
}
