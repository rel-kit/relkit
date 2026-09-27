import type { JobRefAny, TaskRefAny } from "@relkit/contracts/jobs";
import type { DurationInput } from "./duration.js";

/** Browser-safe submission fields. Server-only signals and selectors are separate. */
export interface TriggerOptions {
  readonly operationId?: string;
  readonly idempotencyKey?: string;
  readonly delay?: DurationInput;
  readonly at?: string;
  readonly tags?: readonly string[];
  readonly correlationId?: string;
}

/** Options accepted for server trigger operations. */
export interface ServerTriggerOptions extends TriggerOptions {
  readonly signal?: AbortSignal;
}

/** Job reference constrained to target the selected task. */
export type JobDescriptorForThisTask<Task extends TaskRefAny = TaskRefAny> = JobRefAny & {
  readonly task: Task;
};

/** Options accepted for task trigger operations. */
export interface TaskTriggerOptions<
  Task extends TaskRefAny = TaskRefAny,
> extends ServerTriggerOptions {
  readonly job?: JobDescriptorForThisTask<Task>;
}

/** Options accepted for run result operations. */
export interface RunResultOptions {
  readonly timeout: DurationInput;
  readonly signal?: AbortSignal;
}
