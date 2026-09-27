import type { JobUnknownOutcome } from "@relkit/contracts/jobs";
import type { DurationInput } from "./duration.js";

/** Whether simultaneous occurrences are skipped or allowed. */
export type ScheduleOverlap = "allow" | "skip";
/** How missed occurrences are handled after downtime. */
export type ScheduleMisfire = "skip" | "latest" | "all";

/** Authored schedule target, timing, and admission policy. */
export type ScheduleDefinition<Input = unknown> = {
  readonly id: string;
  readonly input: Input;
  readonly overlap?: ScheduleOverlap;
  readonly misfire?: ScheduleMisfire;
} & (
  | { readonly cron: string; readonly timezone: string; readonly every?: never }
  | { readonly every: DurationInput; readonly cron?: never; readonly timezone?: never }
);

/** Provider read model for a persisted schedule. */
export interface ScheduleRecord<Definition = ScheduleDefinition> {
  readonly id: string;
  readonly jobId: string;
  readonly state: "active" | "paused" | "missing" | "unknown";
  readonly definition: Definition;
  readonly observedAt?: string;
}

/** Receipt returned after a schedule read operation. */
export interface ScheduleReadReceipt<Definition = ScheduleDefinition> {
  readonly outcome: "available" | "unavailable";
  readonly schedule?: ScheduleRecord<Definition>;
  readonly schedules?: readonly ScheduleRecord<Definition>[];
  readonly nextCursor?: string;
  readonly hasMore?: boolean;
  readonly reason?: string;
}

/** Result category for a native schedule mutation. */
export type ScheduleWriteOutcome =
  "created" | "updated" | "paused" | "resumed" | "deleted" | "requested" | "unsupported";

/** Options accepted for schedule list operations. */
export interface ScheduleListOptions {
  readonly limit?: number;
  readonly cursor?: string;
  readonly signal?: AbortSignal;
}

/** Options accepted for schedule write operations. */
export interface ScheduleWriteOptions {
  readonly operationId: string;
  readonly signal?: AbortSignal;
}

/** Receipt returned after a schedule write operation. */
export type ScheduleWriteReceipt<Definition = ScheduleDefinition> =
  | {
      readonly operationId: string;
      readonly scheduleId: string;
      readonly outcome: ScheduleWriteOutcome;
      readonly schedule?: ScheduleRecord<Definition>;
    }
  | (JobUnknownOutcome & { readonly scheduleId: string });

/** Read and write operations available for a job's schedules. */
export interface JobScheduleClient<Definition = ScheduleDefinition> {
  readonly list: (options?: ScheduleListOptions) => Promise<ScheduleReadReceipt<Definition>>;
  readonly get: (
    id: string,
    options?: { readonly signal?: AbortSignal },
  ) => Promise<ScheduleReadReceipt<Definition>>;
  readonly upsert: (
    definition: Definition,
    options: ScheduleWriteOptions,
  ) => Promise<ScheduleWriteReceipt<Definition>>;
  readonly pause: (
    id: string,
    options: ScheduleWriteOptions,
  ) => Promise<ScheduleWriteReceipt<Definition>>;
  readonly resume: (
    id: string,
    options: ScheduleWriteOptions,
  ) => Promise<ScheduleWriteReceipt<Definition>>;
  readonly delete: (
    id: string,
    options: ScheduleWriteOptions,
  ) => Promise<ScheduleWriteReceipt<Definition>>;
}
