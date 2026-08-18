import { CronExpressionParser } from "cron-parser";

export interface CronScheduleOptions {
  readonly timezone: string;
  readonly currentDate: Date;
}

/**
 * Returns the next fire time while keeping the parser and its date type
 * private to the local job provider.
 */
export function nextCronFire(expression: string, options: CronScheduleOptions): Date {
  const schedule = CronExpressionParser.parse(withSeconds(expression), {
    currentDate: options.currentDate,
    strict: true,
    tz: options.timezone,
  });
  return schedule.next().toDate();
}

function withSeconds(expression: string): string {
  const trimmed = expression.trim();
  return trimmed.split(/\s+/).length === 5 ? `0 ${trimmed}` : trimmed;
}
