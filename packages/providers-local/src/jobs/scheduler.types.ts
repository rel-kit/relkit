import type { JsonValue, MaybePromise } from "@relkit/contracts";
import type { ScheduleDefinition, ScheduleOverlap } from "@relkit/jobs/legacy";
import type { Effect } from "effect";
import type { LocalOperationError } from "../local-effect.js";

/** Lazy scheduler operations shared by live composition and deterministic test substitutes. */
export type SchedulerEffects = {
  readonly [K in keyof Scheduler]: Scheduler[K] extends (...args: infer A) => infer R
    ? (...args: A) => Effect.Effect<Awaited<R>, LocalOperationError>
    : never;
};

/** Validated cron schedule with its normalized timezone and identity. */
export interface CompiledSchedule {
  readonly id: string;
  readonly cron: string;
  readonly timezone: string;
  readonly input: JsonValue;
  readonly overlap: ScheduleOverlap;
  readonly nextFireAt: Date;
  readonly nextFire: (currentDate: Date) => Date;
}

/** Occurrence identity and time supplied when enqueueing scheduled work. */
export interface ScheduleEnqueueContext {
  readonly scheduleId: string;
  readonly fireAt: Date;
}

/** The scheduler only emits work through the common job enqueue/invocation seam. */
export type ScheduleEnqueue = (
  input: JsonValue,
  context: ScheduleEnqueueContext,
) => MaybePromise<unknown>;

/** Schedule declaration paired with its enqueue callback. */
export interface SchedulerRegistration {
  readonly schedule: ScheduleDefinition;
  readonly enqueue: ScheduleEnqueue;
}

/** Replaceable clock used by scheduler calculations. */
export interface SchedulerClock {
  readonly now: () => Date | number;
}

/** Clock and scheduling behavior supplied by the local scheduler owner. */
export interface SchedulerOptions {
  readonly clock?: SchedulerClock;
  readonly now?: () => Date | number;
  readonly schedules?: readonly SchedulerRegistration[];
}

/** Result of processing one due schedule occurrence. */
export interface ScheduleRun {
  readonly scheduleId: string;
  readonly fireAt: Date;
  readonly status: "enqueued" | "skipped";
  readonly result?: unknown;
}

/** Registered schedule and its current next-fire/overlap bookkeeping. */
export interface ScheduleState {
  readonly compiled: CompiledSchedule;
  readonly enqueue: ScheduleEnqueue;
  nextFireAt: number;
  active: number;
}

/** Explicitly driven scheduler with registration, due-work execution and inspection. */
export interface Scheduler {
  readonly register: (schedule: ScheduleDefinition, enqueue: ScheduleEnqueue) => CompiledSchedule;
  readonly nextFire: (scheduleId: string) => Date | undefined;
  readonly runDue: (currentDate?: Date | number) => Promise<readonly ScheduleRun[]>;
  readonly tick: (currentDate?: Date | number) => Promise<readonly ScheduleRun[]>;
}
