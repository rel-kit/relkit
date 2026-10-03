import type { CompiledSchedule } from "./scheduler.types.js";
import { canonicalJson, deepFreeze, normalizeId, type JsonValue } from "@relkit/contracts";
import type { ScheduleDefinition } from "@relkit/jobs/legacy";
import { nextCronFire } from "./cron.js";

/** Preserves the public schedule validation error identity and stable error code. */
export class ScheduleValidationError extends TypeError {
  readonly code = "RELKIT_SCHEDULE_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "ScheduleValidationError";
  }
}

/** Validates a static schedule and hides the cron parser behind native dates.
 * @param schedule - Declared schedule configuration.
 * @param options - Operation-specific policy, hooks and configuration.
 * @returns The validated immutable schedule with its next-occurrence calculation.
 */
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

/** Computes the next cron occurrence within the configured timezone.
 * @param cron - Normalized five-field cron expression.
 * @param timezone - IANA timezone for cron evaluation.
 * @param currentDate - Clock date used to evaluate the next occurrence.
 * @returns The next cron occurrence after the supplied date.
 */
export function parseNext(cron: string, timezone: string, currentDate: Date): Date {
  try {
    return nextCronFire(cron, { timezone, currentDate });
  } catch (cause) {
    throw new ScheduleValidationError(
      `Invalid cron/timezone: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

/** Rejects missing or blank schedule identifiers.
 * @param value - Value to validate, normalize or project.
 * @param name - Required field name used in diagnostics.
 * @returns The trimmed nonempty field value.
 */
export function requiredText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${name} is required`);
  return value.trim();
}

/** Rejects invalid clock dates before scheduling work.
 * @param value - Value to validate, normalize or project.
 * @param name - Required field name used in diagnostics.
 * @returns A validated copy of the supplied date.
 */
export function validDate(value: Date, name: string): Date {
  const date = new Date(value.getTime());
  if (!Number.isFinite(date.getTime())) throw new ScheduleValidationError(`${name} is invalid`);
  return date;
}

/** Checks for a non-null, non-array object before inspecting unknown fields.
 * @param value - Value to validate, normalize or project.
 * @returns Whether the value is a non-null, non-array object.
 */
export function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
