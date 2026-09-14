import { assertJsonValue, canonicalJson, normalizeId } from "@relkit/contracts";
import { validateSync, type StandardSchemaV1 } from "@relkit/schema";
import type { ScheduleDefinition } from "./job-types.js";
import { duration } from "./task-validation.js";

export interface ScheduleValidationOptions {
  readonly callerSchema?: StandardSchemaV1;
  readonly canonicalSchema?: StandardSchemaV1;
}

export function copySchedules<CanonicalInput>(
  value: unknown,
  options: ScheduleValidationOptions = {},
): readonly ScheduleDefinition<CanonicalInput>[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new TypeError("Job schedules must be an array");
  const ids = new Set<string>();
  const schedules = value.map((entry) => {
    if (!isRecord(entry)) throw new TypeError("Job schedule must be an object");
    const id = normalizeId(entry.id);
    if (ids.has(id)) throw new TypeError(`Duplicate job schedule "${id}"`);
    ids.add(id);
    if (!hasOwn(entry, "input")) throw new TypeError("schedule.input is required");
    const callerInput = options.callerSchema === undefined
      ? entry.input
      : validateScheduleInput(options.callerSchema, entry.input, "task input");
    const input = options.canonicalSchema === undefined
      ? callerInput
      : validateScheduleInput(options.canonicalSchema, callerInput, "canonical task input");
    assertJsonValue(input);
    if (options.canonicalSchema !== undefined && canonicalJson(input) !== canonicalJson(callerInput)) {
      throw new TypeError("schedule.input must already be canonical task input");
    }
    const hasCron = hasOwn(entry, "cron");
    const hasEvery = hasOwn(entry, "every");
    if (hasCron === hasEvery) throw new TypeError("Schedule must use exactly one of cron or every");
    if (hasEvery && (hasOwn(entry, "timezone") || hasCron)) {
      throw new TypeError("Interval schedules cannot specify cron or timezone");
    }
    const result: Record<string, unknown> = { id, input };
    if (hasCron) {
      if (typeof entry.cron !== "string" || entry.cron.length === 0) {
        throw new TypeError("schedule.cron must be non-empty");
      }
      assertCron(entry.cron);
      if (!isIanaTimezone(entry.timezone)) {
        throw new TypeError("schedule.timezone must be an IANA timezone");
      }
      result.cron = entry.cron;
      result.timezone = entry.timezone;
    } else {
      result.every = duration(entry.every, "schedule.every", true);
    }
    if (entry.overlap !== undefined && entry.overlap !== "allow" && entry.overlap !== "skip") {
      throw new TypeError("schedule.overlap must be allow or skip");
    }
    if (
      entry.misfire !== undefined &&
      entry.misfire !== "skip" &&
      entry.misfire !== "latest" &&
      entry.misfire !== "all"
    ) {
      throw new TypeError("schedule.misfire is invalid");
    }
    if (entry.overlap !== undefined) result.overlap = entry.overlap;
    if (entry.misfire !== undefined) result.misfire = entry.misfire;
    return Object.freeze(result) as ScheduleDefinition<CanonicalInput>;
  });
  return Object.freeze(schedules);
}

function validateScheduleInput(schema: StandardSchemaV1, value: unknown, name: string): unknown {
  const result = validateSync(schema, value as never);
  if (!("value" in result)) throw new TypeError(`schedule.input does not match ${name}`);
  return result.value;
}

function assertCron(value: string): void {
  const fields = value.trim().split(/\s+/u);
  if (fields.length !== 5 || fields.some((field) => !/^[0-9*/?,\-]+$/u.test(field))) {
    throw new TypeError("schedule.cron must be a five-field cron expression");
  }
}

function isIanaTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
