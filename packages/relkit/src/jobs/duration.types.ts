/** Units accepted by the authored duration syntax. */
export type DurationUnit =
  | "millisecond"
  | "milliseconds"
  | "second"
  | "seconds"
  | "minute"
  | "minutes"
  | "hour"
  | "hours"
  | "day"
  | "days"
  | "week"
  | "weeks";

/** An authored decimal amount followed by one duration unit. */
export type DurationInput = `${number} ${DurationUnit}`;
