import type { JsonValue } from "@relkit/contracts";
import type { GraphNodeBase } from "./model.js";

/**
 * Durable or retryable task contract and its declared schemas.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: TaskNode): void => { console.log(value); };
 */
export interface TaskNode extends GraphNodeBase<"task"> {
  readonly taskId: string;
  readonly version: string;
  readonly execution: "durable" | "retryable";
  readonly input: JsonValue;
  readonly output: JsonValue;
  readonly schemaHashes?: JsonValue;
  readonly errors?: JsonValue;
  readonly dependencies?: JsonValue;
  readonly publishes?: JsonValue;
  readonly policy?: JsonValue;
  readonly resources?: JsonValue;
  readonly concurrency?: JsonValue;
  readonly capabilities?: JsonValue;
}

/**
 * Job binding that invokes a versioned task.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: TaskJobNode): void => { console.log(value); };
 */
export interface TaskJobNode extends GraphNodeBase<"job"> {
  readonly executionModel: "task";
  readonly name: string;
  readonly jobId: string;
  readonly taskId: string;
  readonly taskVersion: string;
  readonly buildId?: string;
  readonly profile: string;
  readonly serviceGeneration?: string;
  readonly implicit: boolean;
  readonly default: boolean;
  readonly input: JsonValue;
  readonly schemaHashes?: JsonValue;
  readonly output?: JsonValue;
  readonly errors?: JsonValue;
  readonly progress?: JsonValue;
  readonly streams?: JsonValue;
  readonly policy?: JsonValue;
  readonly schedules?: JsonValue;
  /** @deprecated Legacy materializers may still inspect the singular field. */
  readonly schedule?: JsonValue;
  readonly admission?: JsonValue;
  readonly client?: JsonValue;
  readonly capabilities?: JsonValue;
  readonly compatibility?: JsonValue;
}

/**
 * Legacy job binding that invokes a function.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: LegacyJobNode): void => { console.log(value); };
 */
export interface LegacyJobNode extends GraphNodeBase<"job"> {
  readonly executionModel?: "legacy-function";
  readonly input: JsonValue;
  readonly targetFunctionId: string;
  readonly profile: string;
  readonly retry?: JsonValue;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly schedule?: JsonValue;
  readonly idempotency?: JsonValue;
}

/**
 * Either task-backed or legacy job projection.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: JobNode): void => { console.log(value); };
 */
export type JobNode = TaskJobNode | LegacyJobNode;

/**
 * Lifecycle hook owned by a function or tool.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: FunctionHookNode): void => { console.log(value); };
 */
export interface FunctionHookNode extends GraphNodeBase<"hook"> {
  readonly ownerId: string;
  readonly ownerKind: "function" | "tool";
  readonly phase: "before" | "after";
}

/**
 * Lifecycle hook owned by a task.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: TaskHookNode): void => { console.log(value); };
 */
export interface TaskHookNode extends GraphNodeBase<"hook"> {
  readonly ownerId: string;
  readonly ownerKind: "task";
  readonly phase: "start" | "success" | "failure";
}

/**
 * Any supported lifecycle hook projection.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: HookNode): void => { console.log(value); };
 */
export type HookNode = FunctionHookNode | TaskHookNode;
