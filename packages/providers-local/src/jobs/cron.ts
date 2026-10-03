import type { CronScheduleOptions } from "./cron.types.js";
import { CronExpressionParser } from "cron-parser";

export type { CronScheduleOptions } from "./cron.types.js";

/**
 * Returns the next fire time while keeping the parser and its date type
 * private to the local job provider.
 * @param expression - Cron expression to normalize.
 * @param options - Operation-specific policy, hooks and configuration.
 * @returns The next valid cron occurrence after the supplied date.
 */
export function nextCronFire(expression: string, options: CronScheduleOptions): Date {
  const schedule = CronExpressionParser.parse(withSeconds(expression), {
    currentDate: options.currentDate,
    strict: true,
    tz: options.timezone,
  });
  return schedule.next().toDate();
}

/** Adds the default seconds field required by the cron parser.
 * @param expression - Cron expression to normalize.
 * @returns The cron expression including a seconds field.
 */
function withSeconds(expression: string): string {
  const trimmed = expression.trim();
  return trimmed.split(/\s+/).length === 5 ? `0 ${trimmed}` : trimmed;
}
