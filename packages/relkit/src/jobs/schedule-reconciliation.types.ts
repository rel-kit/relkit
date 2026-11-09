import type { NativeScheduleOperations, OperationContext } from "./adapter.js";
import type { ScheduleDefinition } from "./job.types.js";
/** Native schedule visible to reconciliation, including ownership metadata. */
export interface NativeOwnedScheduleRecord {
  readonly id: string;
  readonly state?: "active" | "paused" | "missing" | "unknown";
  readonly definition?: ScheduleDefinition;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
/** Ordered changes made by a reconciliation pass. */
export interface ScheduleReconciliationResult {
  readonly upserted: readonly string[];
  readonly deleted: readonly string[];
  readonly preserved: readonly string[];
}
/** Existing Promise API options, including the native provider. */
export interface ScheduleReconciliationOptions {
  readonly native: NativeScheduleOperations;
  readonly desired: readonly ScheduleDefinition[];
  readonly existing?: readonly NativeOwnedScheduleRecord[];
  readonly context: OperationContext;
  readonly jobId: string;
  readonly taskId?: string;
  readonly taskVersion?: string;
  readonly buildId: string;
  readonly workerReady?: (() => Promise<void>) | undefined;
}
