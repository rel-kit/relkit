import { cronLike } from "./normalize-compat.js";
import { add } from "./normalize-pass-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";
import { id, isRecord, json, positive, text } from "./normalize-utils.js";

export function validateJob(
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
  value: Record<string, any>,
): void {
  if (value.schedule !== undefined) {
    if (!Array.isArray(value.schedule))
      add(work, descriptor, NORMALIZE_CODES.schedule, "Schedules must be an array.");
    const ids = new Set<string>();
    for (const schedule of Array.isArray(value.schedule) ? value.schedule : []) {
      const scheduleId = isRecord(schedule) ? id(schedule.id) : undefined;
      const unique = scheduleId !== undefined && !ids.has(scheduleId);
      if (scheduleId !== undefined) ids.add(scheduleId);
      const valid =
        unique &&
        isRecord(schedule) &&
        cronLike(schedule.cron) &&
        text(schedule.timezone) !== undefined &&
        ["skip", "allow"].includes(schedule.overlap) &&
        json(schedule.input);
      if (!valid)
        add(
          work,
          descriptor,
          NORMALIZE_CODES.schedule,
          "Schedule must have a five-field cron, timezone, overlap policy, and JSON input.",
        );
    }
  }
  if (
    value.idempotency !== undefined &&
    (!isRecord(value.idempotency) ||
      text(value.idempotency.key) === undefined ||
      !positive(value.idempotency.retentionMs))
  )
    add(work, descriptor, NORMALIZE_CODES.idempotency, "Idempotency definition is invalid.");
}
