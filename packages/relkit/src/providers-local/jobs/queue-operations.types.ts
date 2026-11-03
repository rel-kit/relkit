import type { JobQueue } from "./queue-utils.js";
import type { JobQueueAdminMutations } from "./queue-admin.js";

/** Serialized Promise mutations over one local queue state. */
export type JobQueueMutations = Pick<
  JobQueue,
  "ready" | "enqueue" | "acquire" | "renew" | "transition" | "recover" | "expire"
> &
  JobQueueAdminMutations;
/** Clock, identity and lease policy shared by serialized queue mutations. */
export interface JobQueueMutationOptions {
  readonly clock: () => number;
  readonly createInstanceId?: () => string;
  readonly ownerToken: string;
  readonly leaseDurationMs: number;
  readonly idempotency?: import("./queue-utils.js").JobQueueEnqueue["idempotency"];
}
