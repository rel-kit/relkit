import type { JobsAdapterRuntime } from "@relkit/jobs/adapter";
import type { RunSnapshot } from "@relkit/contracts/jobs";
import type { TestClock } from "./runtime.js";

/** Deterministic native adapter time, failure injection and unknown-outcome policy. */
export interface TestJobsAdapterOptions {
  readonly logger?: import("@relkit/runtime-effect").LoggerOptions;
  readonly clock?: TestClock;
  readonly startTimeMs?: number;
  readonly service?: string;
  readonly unknown?: Partial<Record<"submit" | "cancel" | "retry", boolean>>;
}

/** Owned native jobs adapter with deterministic worker and snapshot test controls. */
export interface TestJobsAdapter extends JobsAdapterRuntime {
  readonly clock: TestClock;
  readonly runNext: () => Promise<import("@relkit/jobs/adapter").NativeTaskWork | undefined>;
  readonly snapshot: (runId: string) => RunSnapshot;
}
