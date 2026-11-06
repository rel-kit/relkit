import type { DurationInput } from "./duration.js";
import type { MemoryInput } from "./task-core.types.js";

/** Session lookup supplied to a task through its auth dependency. */
export interface TaskAuthContext<Session = unknown> {
  readonly getSession: () => Promise<Session | null>;
}

/** Authoring policy for task retry attempts and backoff. */
export interface TaskRetryPolicy {
  readonly maxAttempts: number;
  readonly initialDelay?: DurationInput;
  readonly maxDelay?: DurationInput;
  readonly factor?: number;
  readonly jitter?: "none" | "full";
}

/** Fully populated retry policy used by the runtime. */
export interface NormalizedTaskRetryPolicy {
  readonly maxAttempts: number;
  readonly initialDelay: DurationInput;
  readonly maxDelay: DurationInput;
  readonly factor: number;
  readonly jitter: "none" | "full";
}

/** CPU and memory resources requested for task execution. */
export interface TaskResources {
  readonly cpu: number;
  readonly memory: MemoryInput;
}

/** Limit and optional input key for task execution concurrency. */
export interface TaskConcurrency<InputKey extends string = string> {
  readonly limit: number;
  readonly key?: InputKey;
}

/** Stable sleep key used when a durable task suspends. */
export interface TaskSleepOptions {
  readonly key: string;
}
