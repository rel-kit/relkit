/** Timezone and date bounds passed to the cron parser. */
export interface CronScheduleOptions {
  readonly timezone: string;
  readonly currentDate: Date;
}
