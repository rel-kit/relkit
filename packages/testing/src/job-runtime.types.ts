import type { WorkOwnershipState } from "./work-ownership.types.js";
import type { materializeJobs } from "@relkit/engine";
import type { JobQueue } from "@relkit/providers-local";

/** Admission, native cancellation and actual completion receipts for one durable job owner. */
export interface JobRuntimeState extends WorkOwnershipState {}

/** Current-generation native authorities read lazily by ordered worker workflows. */
export interface JobWorkerState {
  readonly queue: () => JobQueue;
  readonly worker: () => Awaited<ReturnType<typeof materializeJobs>>;
  readonly jobId: string;
  readonly now: () => number;
  readonly isClosed: () => boolean;
}
