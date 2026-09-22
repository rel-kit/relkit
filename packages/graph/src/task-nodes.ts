import type { JsonValue } from "@relkit/contracts";
import type { GraphNodeBase } from "./model.js";

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

export type JobNode = TaskJobNode | LegacyJobNode;

export interface FunctionHookNode extends GraphNodeBase<"hook"> {
  readonly ownerId: string;
  readonly ownerKind: "function" | "tool";
  readonly phase: "before" | "after";
}

export interface TaskHookNode extends GraphNodeBase<"hook"> {
  readonly ownerId: string;
  readonly ownerKind: "task";
  readonly phase: "start" | "success" | "failure";
}

export type HookNode = FunctionHookNode | TaskHookNode;
