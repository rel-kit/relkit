import { Effect, Result, Schema } from "effect";
import { observeJobs } from "./jobs-observability.js";
import type { DurationInput, DurationUnit } from "./duration.types.js";

export type { DurationInput, DurationUnit } from "./duration.types.js";

/** A malformed, inexact, or unsafe authored duration.
 * @example new DurationValidationError({ input: "1.1 milliseconds", reason: "Invalid duration" });
 */
export class DurationValidationError extends Schema.TaggedError<DurationValidationError>()(
  "Jobs.DurationValidationError",
  { input: Schema.String, reason: Schema.String },
) {}

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

/** Tests authored duration syntax in the Effect path.
 * @param value - Untrusted candidate.
 * @returns An Effect succeeding with a boolean and no typed error.
 * @example Effect.runSync(isDurationInputEffect("1 second"));
 */
export const isDurationInputEffect = Effect.fn("Jobs.isDurationInput")(
  function* (value: unknown) {
    return typeof value === "string" && DURATION_PATTERN.test(value);
  },
  (effect) => observeJobs("duration.isInput", effect),
);

/** Tests authored duration syntax.
 * @param value - Untrusted candidate.
 * @returns Whether the value is a duration string.
 * @throws A runtime defect if the Effect cannot execute synchronously.
 * @example isDurationInput("1 second");
 */
export function isDurationInput(value: unknown): value is DurationInput {
  return Effect.runSync(isDurationInputEffect(value));
}

/** Converts an authored duration to exact, safe milliseconds.
 * @param value - Authored duration string.
 * @returns An Effect of milliseconds or DurationValidationError.
 * @example Effect.runPromise(durationToMillisEffect("1.5 seconds"));
 */
export const durationToMillisEffect = Effect.fn("Jobs.durationToMillis")(
  function* (value: DurationInput) {
    const match = DURATION_PATTERN.exec(value);
    const wholeText = match?.[1];
    const fractionText = match?.[2];
    const unit = match?.[3];
    if (wholeText === undefined || unit === undefined) {
      return yield* Effect.fail(
        new DurationValidationError({
          input: String(value),
          reason: `Invalid duration "${String(value)}"`,
        }),
      );
    }
    const unitMilliseconds = UNIT_MILLISECONDS[unit as DurationUnit];
    const fraction = fractionText ?? "";
    const scale = 10n ** BigInt(fraction.length);
    const amount = BigInt(wholeText) * scale + BigInt(fraction || "0");
    const millisecondsNumerator = amount * unitMilliseconds;
    if (millisecondsNumerator % scale !== 0n) {
      return yield* Effect.fail(
        new DurationValidationError({
          input: value,
          reason: `Duration "${value}" does not represent an exact millisecond`,
        }),
      );
    }
    const milliseconds = millisecondsNumerator / scale;
    if (milliseconds > MAX_SAFE_INTEGER) {
      return yield* Effect.fail(
        new DurationValidationError({
          input: value,
          reason: `Duration "${value}" exceeds safe millisecond range`,
        }),
      );
    }
    return Number(milliseconds);
  },
  (effect) => observeJobs("duration.toMillis", effect),
);

/** Compatibility adapter for authored duration parsing.
 * @param value - Authored duration string.
 * @returns Exact milliseconds.
 * @throws TypeError when the duration is invalid or cannot be represented safely.
 * @example durationToMillis("1.5 seconds");
 */
export function durationToMillis(value: DurationInput): number {
  const result = Effect.runSync(Effect.result(durationToMillisEffect(value)));
  if (Result.isFailure(result)) throw new TypeError(result.failure.reason);
  return result.success;
}

/** Alias for durationToMillis.
 * @param value - Authored duration string.
 * @returns Exact milliseconds.
 * @throws TypeError when the duration is invalid or unsafe.
 * @example parseDuration("1 second");
 */
export const parseDuration = durationToMillis;

/** Alias for durationToMillis.
 * @param value - Authored duration string.
 * @returns Exact milliseconds.
 * @throws TypeError when the duration is invalid or unsafe.
 * @example validateDuration("1 second");
 */
export const validateDuration = durationToMillis;
