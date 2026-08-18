import type {
  DependencyClientSources,
  InvocationHooks,
  InvocationTarget,
  JobRunResult,
} from "@zsys/engine";
import type { JobClient, JobProvider, RetryPolicy } from "@zsys/jobs";
import type {
  JobAdmin,
  JobIdempotencyDefinition,
  JobQueueCounts,
  JobQueueEntry,
} from "@zsys/providers-local";
import type { TestClock } from "./runtime.js";
import type { TestFailureControls } from "./fakes.js";
import type { JsonValue } from "@zsys/contracts";

export interface TestJobOptions<Input = JsonValue, Output = unknown> {
  readonly jobId?: string;
  readonly target: InvocationTarget<Input, Output>;
  readonly retry?: RetryPolicy;
  readonly profile?: string;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly consumerConcurrency?: number;
  readonly idempotency?: JobIdempotencyDefinition;
  readonly leaseDurationMs?: number;
  readonly ownerId?: string;
  readonly stateRoot?: string;
  readonly startTimeMs?: number;
  readonly random?: () => number;
  readonly randomValues?: readonly number[];
  readonly failures?: TestFailureControls;
  readonly env?: Readonly<Record<string, unknown>>;
  readonly clients?: DependencyClientSources;
  readonly hooks?: InvocationHooks;
}

export interface TestJobCloseOptions {
  readonly failed?: boolean;
}

export interface TestJobFake<Input = JsonValue, Output = unknown> extends JobClient<Input> {
  readonly id: string;
  readonly client: JobClient<Input>;
  readonly provider: JobProvider;
  readonly stateRoot: string;
  readonly clock: TestClock;
  readonly random: () => number;
  readonly failures: TestFailureControls;
  readonly admin: JobAdmin;
  readonly status: () => JobQueueCounts;
  readonly get: (instanceId: string) => JobQueueEntry | undefined;
  readonly runNext: (instanceId?: string) => Promise<JobRunResult | undefined>;
  readonly drain: () => Promise<readonly JobRunResult[]>;
  readonly restart: () => Promise<void>;
  readonly close: (options?: TestJobCloseOptions) => Promise<void>;
}
