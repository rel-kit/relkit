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

export interface ServerTriggerOptions extends TriggerOptions {
  readonly signal?: AbortSignal;
}

export type JobDescriptorForThisTask<Task extends TaskRefAny = TaskRefAny> = JobRefAny & {
  readonly task: Task;
};

export interface TaskTriggerOptions<Task extends TaskRefAny = TaskRefAny>
  extends ServerTriggerOptions {
  readonly job?: JobDescriptorForThisTask<Task>;
}

export interface RunResultOptions {
  readonly timeout: DurationInput;
  readonly signal?: AbortSignal;
}
