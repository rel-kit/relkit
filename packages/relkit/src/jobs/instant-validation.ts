import { Effect, Result, Schema } from "effect";
import { observeJobs } from "./jobs-observability.js";

const RFC3339_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/u;
const MAX_DATE_MILLIS = 8_640_000_000_000_000;

/** An invalid authored RFC 3339 instant.
 * @example new InstantValidationError({ name: "instant", reason: "invalid" });
 */
export class InstantValidationError extends Schema.TaggedError<InstantValidationError>()(
  "Jobs.InstantValidationError",
  { name: Schema.String, reason: Schema.String },
) {}

/** Checks RFC 3339 syntax and calendar bounds in Effect.
 * @param value - Untrusted candidate.
 * @returns An Effect of a boolean with no typed failure.
 * @example Effect.runSync(isRfc3339InstantEffect("2026-01-01T00:00:00Z"));
 */
export const isRfc3339InstantEffect = Effect.fn("Jobs.isRfc3339Instant")(
  function* (value: unknown) {
    if (typeof value !== "string") return false;
    const match = RFC3339_PATTERN.exec(value);
    if (match === null) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);
    const daysInMonth =
      month === 2
        ? year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
          ? 29
          : 28
        : [4, 6, 9, 11].includes(month)
          ? 30
          : 31;
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth) return false;
    if (hour > 23 || minute > 59 || second > 59) return false;
    const offset = match[7];
    if (offset === undefined) return false;
    const offsetHours = offset === "Z" ? 0 : Number(offset.slice(1, 3));
    const offsetMinutePart = offset === "Z" ? 0 : Number(offset.slice(4));
    if (offsetHours > 23 || offsetMinutePart > 59) return false;
    const offsetMinutes =
      offset === "Z"
        ? 0
        : (offset.startsWith("-") ? -1 : 1) * (offsetHours * 60 + offsetMinutePart);
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(hour, minute, second, 0);
    const timestamp = date.getTime() - offsetMinutes * 60_000;
    return Number.isFinite(timestamp) && Math.abs(timestamp) <= MAX_DATE_MILLIS;
  },
  (effect) => observeJobs("instant.is", effect),
);

/** Synchronous RFC 3339 predicate.
 * @param value - Untrusted candidate.
 * @returns Whether it is a calendar-valid RFC 3339 instant.
 * @throws A runtime defect if the Effect cannot execute synchronously.
 * @example isRfc3339Instant("2026-01-01T00:00:00Z");
 */
export function isRfc3339Instant(value: unknown): value is string {
  return Effect.runSync(isRfc3339InstantEffect(value));
}

/** Requires an RFC 3339 instant in Effect.
 * @param value - Untrusted candidate.
 * @param name - Field name for diagnostics.
 * @returns An Effect of void or InstantValidationError.
 * @example Effect.runPromise(assertRfc3339InstantEffect("2026-01-01T00:00:00Z"));
 */
export const assertRfc3339InstantEffect = Effect.fn("Jobs.assertRfc3339Instant")(
  function* (value: unknown, name = "instant") {
    if (yield* isRfc3339InstantEffect(value)) return;
    return yield* Effect.fail(
      new InstantValidationError({
        name,
        reason: `${name} must be a valid RFC 3339 instant`,
      }),
    );
  },
  (effect) => observeJobs("instant.assert", effect),
);

/** Synchronous RFC 3339 assertion.
 * @param value - Untrusted candidate.
 * @param name - Field name for diagnostics.
 * @returns Nothing when valid.
 * @throws TypeError when the instant is invalid.
 * @example assertRfc3339Instant("2026-01-01T00:00:00Z");
 */
export function assertRfc3339Instant(value: unknown, name = "instant"): asserts value is string {
  const result = Effect.runSync(Effect.result(assertRfc3339InstantEffect(value, name)));
  if (Result.isFailure(result)) throw new TypeError(result.failure.reason);
}
