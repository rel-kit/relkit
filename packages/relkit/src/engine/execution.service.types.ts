import type { materializeEventsEffect } from "./materialize-events.js";
import type { executeTaskEffect } from "./task-executor.js";

/** Effect event materialization contract shared by real and fake provider layers. */
export interface EventMaterializationOperations {
  readonly materialize: typeof materializeEventsEffect;
}

/** Effect task execution contract; native binding owns durable controls. */
export interface TaskExecutionOperations {
  readonly execute: typeof executeTaskEffect;
}
