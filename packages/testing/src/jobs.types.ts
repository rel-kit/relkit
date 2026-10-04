import type {
  DependencyClientSources,
  InvocationHooks,
  InvocationTarget,
  JobRunResult,
} from "@relkit/engine";
import type { JobClient, JobProvider, RetryPolicy } from "@relkit/jobs/legacy";
import type {
  JobAdmin,
  JobIdempotencyDefinition,
  JobQueueCounts,
  JobQueueEntry,
} from "@relkit/providers-local";
import type { TestClock } from "./runtime.js";
import type { TestFailureControls } from "./fakes.js";
import type { JsonValue } from "@relkit/contracts";

/**
 * Durable native target, retry bounds and deterministic persistence dependencies.
 * @typeParam Input - Input accepted by the native target schema.
 * @typeParam Output - Output validated by the native target schema.
 */
export interface TestJobOptions<Input = JsonValue, Output = unknown> {
  readonly logger?: import("@relkit/runtime-effect").LoggerOptions;
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

/** Explicit failed-test state retention policy for durable job shutdown. */
export interface TestJobCloseOptions {
  readonly failed?: boolean;
}

/**
 * Owned durable native job facade with deterministic admission and lifecycle controls.
 * @typeParam Input - Input accepted by the native target schema.
 * @typeParam Output - Output validated by the native target schema.
 */
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
