import { observeJobs } from "./observability.js";
import { Effect } from "effect";
import { runJobsSync } from "./compatibility.js";
import { add } from "../normalize-pass-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizationWork,
  type NormalizedDescriptor,
} from "../normalize-types.js";
import { isRecord, json } from "../normalize-utils.js";

/**
 * Checks schedule identity, expressions, input, and recovery policies.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @param job - Normalized job binding being projected or checked.
 * @returns A lazy effect yielding void after appending all invalid schedule diagnostics.
 * @remarks Requires no services. Validation findings append diagnostics; unexpected exceptions remain defects.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { validateSchedulesEffect } from "./schedule-validation.js";
 * // job is normalized; work owns all resulting schedule diagnostics.
 * Effect.runSync(validateSchedulesEffect(work, job));
 * ```
 */
export const validateSchedulesEffect = Effect.fn("Jobs.validateSchedules")(
  function* (work: NormalizationWork, job: NormalizedDescriptor) {
    const value = isRecord(job.value) ? job.value : {};
    const schedules = value.schedules ?? value.schedule;
    if (schedules === undefined) return;
    if (!Array.isArray(schedules)) {
      add(work, job, NORMALIZE_CODES.jobSchedule, "Job schedules must be an array.");
      return;
    }
    const ids = new Set<string>();
    for (const schedule of schedules) {
      const record = isRecord(schedule) ? schedule : {};
      const id = typeof record.id === "string" ? record.id : "";
      if (id.length === 0 || ids.has(id))
        add(
          work,
          job,
          NORMALIZE_CODES.jobSchedule,
          "Job schedule IDs must be unique non-empty strings.",
        );
      ids.add(id);
      const cron = typeof record.cron === "string";
      const every = typeof record.every === "string";
      if (
        cron === every ||
        (cron && !cronLike(record.cron)) ||
        (every && !durationLike(record.every))
      )
        add(
          work,
          job,
          NORMALIZE_CODES.jobSchedule,
          `Schedule "${id}" must use one valid cron or every expression.`,
        );
      if (cron && typeof record.timezone !== "string")
        add(work, job, NORMALIZE_CODES.jobSchedule, `Schedule "${id}" requires an IANA timezone.`);
      if (!Object.hasOwn(record, "input") || !json(record.input))
        add(work, job, NORMALIZE_CODES.jobSchedule, `Schedule "${id}" must contain JSON input.`);
      if (record.overlap !== undefined && record.overlap !== "allow" && record.overlap !== "skip")
        add(
          work,
          job,
          NORMALIZE_CODES.jobSchedule,
          `Schedule "${id}" has an invalid overlap policy.`,
        );
      if (
        record.misfire !== undefined &&
        !["skip", "latest", "all"].includes(String(record.misfire))
      )
        add(
          work,
          job,
          NORMALIZE_CODES.jobSchedule,
          `Schedule "${id}" has an invalid misfire policy.`,
        );
    }
  },
  (effect, work, job) => observeJobs("validateSchedules", effect, () => ({ jobs: 1 })),
);

/**
 * Checks schedule identity, expressions, input, and recovery policies.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @param job - Normalized job binding being projected or checked.
 * @returns void after appending all invalid schedule diagnostics.
 * @see {@link validateSchedulesEffect} for composition and execution examples.
 */
export function validateSchedules(work: NormalizationWork, job: NormalizedDescriptor): void {
  return runJobsSync(validateSchedulesEffect(work, job));
}

/**
 * Checks the compiler's five-field cron shape contract.
 * @param value - Value or descriptor to inspect without coercion.
 * @returns whether the value is a five-field cron string.
 */
function cronLike(value: unknown): boolean {
  return typeof value === "string" && value.trim().split(/\s+/u).length === 5;
}

/**
 * Checks the compiler's supported human-readable interval syntax.
 * @param value - Value or descriptor to inspect without coercion.
 * @returns whether the value matches the accepted duration syntax.
 */
function durationLike(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^\d+(?:\.\d+)? (?:milliseconds?|seconds?|minutes?|hours?|days?|weeks?)$/u.test(value)
  );
}
