import {
  canonicalJson,
  deepFreeze,
  normalizeId,
  type JsonValue,
  type MaybePromise,
} from "@relkit/contracts";
import type { ScheduleDefinition, ScheduleOverlap } from "@relkit/jobs";
import { nextCronFire } from "./cron.js";
export class ScheduleValidationError extends TypeError {
  readonly code = "RELKIT_SCHEDULE_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "ScheduleValidationError";
  }
}

export interface CompiledSchedule {
  readonly id: string;
  readonly cron: string;
  readonly timezone: string;
  readonly input: JsonValue;
  readonly overlap: ScheduleOverlap;
  readonly nextFireAt: Date;
  readonly nextFire: (currentDate: Date) => Date;
}

export interface ScheduleEnqueueContext {
  readonly scheduleId: string;
  readonly fireAt: Date;
}

/** The scheduler only emits work through the common job enqueue/invocation seam. */
export type ScheduleEnqueue = (
  input: JsonValue,
  context: ScheduleEnqueueContext,
) => MaybePromise<unknown>;

export interface SchedulerRegistration {
  readonly schedule: ScheduleDefinition;
  readonly enqueue: ScheduleEnqueue;
}

export interface SchedulerClock {
  readonly now: () => Date | number;
}

export interface SchedulerOptions {
  readonly clock?: SchedulerClock;
  readonly now?: () => Date | number;
  readonly schedules?: readonly SchedulerRegistration[];
}

export interface ScheduleRun {
  readonly scheduleId: string;
  readonly fireAt: Date;
  readonly status: "enqueued" | "skipped";
  readonly result?: unknown;
}

interface ScheduleState {
  readonly compiled: CompiledSchedule;
  readonly enqueue: ScheduleEnqueue;
  nextFireAt: number;
  active: number;
}

export interface Scheduler {
  readonly register: (schedule: ScheduleDefinition, enqueue: ScheduleEnqueue) => CompiledSchedule;
  readonly nextFire: (scheduleId: string) => Date | undefined;
  readonly runDue: (currentDate?: Date | number) => Promise<readonly ScheduleRun[]>;
  readonly tick: (currentDate?: Date | number) => Promise<readonly ScheduleRun[]>;
}

/** Validates a static schedule and hides the cron parser behind native dates. */
export function compileSchedule(
  schedule: ScheduleDefinition,
  options: { readonly currentDate?: Date } = {},
): CompiledSchedule {
  try {
    if (!isRecord(schedule)) throw new Error("Schedule must be an object");
    const id = normalizeId(schedule.id);
    const cron = requiredText(schedule.cron, "cron").replace(/\s+/g, " ");
    if (cron.split(" ").length !== 5) throw new Error("cron must have five fields");
    const timezone = requiredText(schedule.timezone, "timezone");
    if (!Object.prototype.hasOwnProperty.call(schedule, "input"))
      throw new Error("schedule.input is required");
    const input = JSON.parse(canonicalJson(schedule.input)) as JsonValue;
    const overlap = schedule.overlap;
    if (overlap !== "skip" && overlap !== "allow") throw new Error("overlap must be skip or allow");
    const currentDate = validDate(options.currentDate ?? new Date(0), "current date");
    const first = parseNext(cron, timezone, currentDate);
    return deepFreeze({
      id,
      cron,
      timezone,
      input: deepFreeze(input),
      overlap,
      nextFireAt: first,
      nextFire: (date: Date) => parseNext(cron, timezone, validDate(date, "current date")),
    });
  } catch (cause) {
    if (cause instanceof ScheduleValidationError) throw cause;
    throw new ScheduleValidationError(cause instanceof Error ? cause.message : String(cause));
  }
}

/** Runs due schedules against an injected clock without owning or calling handlers. */
export function createScheduler(options: SchedulerOptions = {}): Scheduler {
  const readClock = options.clock?.now ?? options.now ?? (() => new Date());
  const states = new Map<string, ScheduleState>();

  const register = (schedule: ScheduleDefinition, enqueue: ScheduleEnqueue): CompiledSchedule => {
    if (typeof enqueue !== "function") throw new TypeError("Schedule enqueue target is required");
    const compiled = compileSchedule(schedule, { currentDate: readDate(readClock()) });
    if (states.has(compiled.id))
      throw new ScheduleValidationError(`Duplicate schedule "${compiled.id}"`);
    states.set(compiled.id, {
      compiled,
      enqueue,
      nextFireAt: compiled.nextFireAt.getTime(),
      active: 0,
    });
    return compiled;
  };

  for (const registration of options.schedules ?? [])
    register(registration.schedule, registration.enqueue);

  const nextFire = (scheduleId: string): Date | undefined => {
    const state = states.get(normalizeId(scheduleId));
    return state === undefined ? undefined : new Date(state.nextFireAt);
  };

  const runDue = async (currentDate?: Date | number): Promise<readonly ScheduleRun[]> => {
    const now = readDate(currentDate ?? readClock()).getTime();
    const runs: Promise<ScheduleRun>[] = [];
    for (const state of [...states.values()].sort((a, b) =>
      a.compiled.id.localeCompare(b.compiled.id),
    )) {
      while (state.nextFireAt <= now) {
        const fireAt = new Date(state.nextFireAt);
        state.nextFireAt = state.compiled.nextFire(fireAt).getTime();
        if (state.compiled.overlap === "skip" && state.active > 0) {
          runs.push(Promise.resolve({ scheduleId: state.compiled.id, fireAt, status: "skipped" }));
          continue;
        }
        state.active += 1;
        runs.push(
          Promise.resolve()
            .then(() =>
              state.enqueue(state.compiled.input, { scheduleId: state.compiled.id, fireAt }),
            )
            .then((result) => ({
              scheduleId: state.compiled.id,
              fireAt,
              status: "enqueued" as const,
              result,
            }))
            .finally(() => {
              state.active -= 1;
            }),
        );
      }
    }
    return Promise.all(runs);
  };

  return Object.freeze({ register, nextFire, runDue, tick: runDue });
}

function parseNext(cron: string, timezone: string, currentDate: Date): Date {
  try {
    return nextCronFire(cron, { timezone, currentDate });
  } catch (cause) {
    throw new ScheduleValidationError(
      `Invalid cron/timezone: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

function requiredText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${name} is required`);
  return value.trim();
}

function validDate(value: Date, name: string): Date {
  const date = new Date(value.getTime());
  if (!Number.isFinite(date.getTime())) throw new ScheduleValidationError(`${name} is invalid`);
  return date;
}

function readDate(value: Date | number): Date {
  return validDate(typeof value === "number" ? new Date(value) : value, "clock date");
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
