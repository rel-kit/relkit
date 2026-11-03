import type { materializeEventsEffect } from "./materialize-events.js";
import type { materializeJobsEffect } from "./materialize-jobs.js";
import type { executeTaskEffect } from "./task-executor.js";

/** Effect event materialization contract shared by real and fake provider layers. */
export interface EventMaterializationOperations {
  readonly materialize: typeof materializeEventsEffect;
}

/** Effect job materialization contract shared by real and fake queue layers. */
export interface JobMaterializationOperations {
  readonly materialize: typeof materializeJobsEffect;
}

/** Effect task execution contract; native binding owns durable controls. */
export interface TaskExecutionOperations {
  readonly execute: typeof executeTaskEffect;
}
