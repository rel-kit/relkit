import type { JobUnknownOutcome } from "@relkit/contracts/jobs";
import type { DurationInput } from "./duration.js";

export type ScheduleOverlap = "allow" | "skip";
export type ScheduleMisfire = "skip" | "latest" | "all";

export type ScheduleDefinition<Input = unknown> = {
  readonly id: string;
  readonly input: Input;
  readonly overlap?: ScheduleOverlap;
  readonly misfire?: ScheduleMisfire;
} & (
  | { readonly cron: string; readonly timezone: string; readonly every?: never }
  | { readonly every: DurationInput; readonly cron?: never; readonly timezone?: never }
);

export interface ScheduleRecord<Definition = ScheduleDefinition> {
  readonly id: string;
  readonly jobId: string;
  readonly state: "active" | "paused" | "missing" | "unknown";
  readonly definition: Definition;
  readonly observedAt?: string;
}

export interface ScheduleReadReceipt<Definition = ScheduleDefinition> {
  readonly outcome: "available" | "unavailable";
  readonly schedule?: ScheduleRecord<Definition>;
  readonly schedules?: readonly ScheduleRecord<Definition>[];
  readonly nextCursor?: string;
  readonly hasMore?: boolean;
  readonly reason?: string;
}

export type ScheduleWriteOutcome =
  "created" | "updated" | "paused" | "resumed" | "deleted" | "requested" | "unsupported";

export interface ScheduleListOptions {
  readonly limit?: number;
  readonly cursor?: string;
  readonly signal?: AbortSignal;
}

export interface ScheduleWriteOptions {
  readonly operationId: string;
  readonly signal?: AbortSignal;
}

export type ScheduleWriteReceipt<Definition = ScheduleDefinition> =
  | {
      readonly operationId: string;
      readonly scheduleId: string;
      readonly outcome: ScheduleWriteOutcome;
      readonly schedule?: ScheduleRecord<Definition>;
    }
  | (JobUnknownOutcome & { readonly scheduleId: string });

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
