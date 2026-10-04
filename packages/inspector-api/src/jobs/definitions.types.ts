import type { JsonValue } from "@relkit/contracts";

/** Pure projected definition selectors; absence never introduces a default filter. */
export interface JobDefinitionFilters {
  readonly search?: string | undefined;
  readonly job?: string | undefined;
  readonly task?: string | undefined;
  readonly service?: string | undefined;
}

/** Projected task-backed job declaration, service health and bounded lifecycle metadata. */
export interface JobDefinitionRecord {
  readonly id: string;
  readonly name: string;
  readonly jobId: string;
  readonly taskId: string;
  readonly taskVersion: string;
  readonly buildId?: string;
  readonly service: string;
  readonly serviceGeneration?: string;
  readonly implicit: boolean;
  readonly default: boolean;
  readonly execution: string;
  readonly schema?: JsonValue;
  readonly contextDependencies?: JsonValue;
  readonly policy?: JsonValue;
  readonly resources?: JsonValue;
  readonly hooks?: JsonValue;
  readonly capabilities?: JsonValue;
  readonly schedules?: JsonValue;
  readonly worker: JsonValue;
  readonly health: string;
  readonly retired: boolean;
  readonly source?: JsonValue;
}
