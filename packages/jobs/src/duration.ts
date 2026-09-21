import { Duration, Option } from "effect";

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

export type DurationInput = `${number} ${DurationUnit}`;

const DURATION_PATTERN =
  /^((?:0|[1-9]\d*))(?:\.(\d+))? (millisecond|milliseconds|second|seconds|minute|minutes|hour|hours|day|days|week|weeks)$/u;
const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);
const UNIT_MILLISECONDS: Readonly<Record<DurationUnit, bigint>> = {
  millisecond: 1n,
  milliseconds: 1n,
  second: 1_000n,
  seconds: 1_000n,
  minute: 60_000n,
  minutes: 60_000n,
  hour: 3_600_000n,
  hours: 3_600_000n,
  day: 86_400_000n,
  days: 86_400_000n,
  week: 604_800_000n,
  weeks: 604_800_000n,
};

export function isDurationInput(value: unknown): value is DurationInput {
  return typeof value === "string" && DURATION_PATTERN.test(value);
}

export function durationToMillis(value: DurationInput): number {
  const match = DURATION_PATTERN.exec(value);
  if (!match) throw new TypeError(`Invalid duration "${String(value)}"`);
  const wholeText = match[1];
  const fractionText = match[2];
  const unit = match[3];
  if (wholeText === undefined || unit === undefined) {
    throw new TypeError(`Invalid duration "${String(value)}"`);
  }
  const fraction = fractionText ?? "";
  const scale = 10n ** BigInt(fraction.length);
  const amount = BigInt(wholeText) * scale + BigInt(fraction || "0");
  const millisecondsNumerator = amount * UNIT_MILLISECONDS[unit as DurationUnit];
  if (millisecondsNumerator % scale !== 0n) {
    throw new TypeError(`Duration "${value}" does not represent an exact millisecond`);
  }
  const milliseconds = millisecondsNumerator / scale;
  if (milliseconds > MAX_SAFE_INTEGER) {
    throw new TypeError(`Duration "${value}" exceeds safe millisecond range`);
  }

  const effectUnit = unit === "millisecond" || unit === "milliseconds" ? "millis" : unit;
  const effectInput = `${wholeText}${fractionText === undefined ? "" : `.${fractionText}`} ${effectUnit}`;
  const parsed = Duration.fromInput(effectInput as Duration.Input);
  if (Option.isNone(parsed)) throw new TypeError(`Invalid duration "${value}"`);
  const duration = Duration.fromInputUnsafe(effectInput as Duration.Input);
  const result = Duration.toMillis(duration);
  const expected = Number(milliseconds);
  if (!Number.isSafeInteger(result) || result !== expected) {
    throw new TypeError(`Duration "${value}" cannot be represented safely`);
  }
  return result;
}

export const parseDuration = durationToMillis;
export const validateDuration = durationToMillis;
