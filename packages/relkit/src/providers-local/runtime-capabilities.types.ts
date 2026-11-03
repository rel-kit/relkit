import type { JobQueue } from "./jobs/queue.js";
import type { JobIdempotencyDefinition } from "./jobs/queue-utils.js";

/** Public local native-job adapter with worker and lifecycle capabilities. */
export interface LocalJobProvider {
  readonly createQueue: (context: {
    readonly jobId: string;
    readonly idempotency?: JobIdempotencyDefinition;
  }) => Promise<JobQueue>;
  readonly close: () => Promise<void>;
}
