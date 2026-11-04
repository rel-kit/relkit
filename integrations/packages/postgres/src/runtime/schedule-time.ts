/**
 * Pure occurrence arithmetic for persisted schedules. Cron schedules use
 * Effect's `Cron` with the schedule's IANA timezone; interval schedules advance
 * from the previous occurrence so they do not drift with polling. The misfire
 * policy decides which due occurrences are enqueued after downtime.
 */
import type { JsonValue } from "relkit/contracts";
import { durationToMillis } from "relkit/jobs";
import { Cron } from "effect";

/** How far behind an occurrence may be and still count as on time for `misfire: "skip"`. */
export const ON_TIME_MS = 60_000;
/** Upper bound of occurrences enqueued in one pass for `misfire: "all"`. */
export const MAX_CATCH_UP = 100;

/** Timing fields of a stored schedule definition. */
export interface ScheduleTiming {
  readonly cron?: string;
  readonly timezone?: string;
  readonly every?: JsonValue;
  readonly misfire?: "skip" | "latest" | "all";
}

/**
 * Computes the first occurrence strictly after an instant.
 * @param timing - Cron (with timezone) or interval timing.
 * @param after - Instant to start from.
 * @returns The next occurrence.
 * @throws TypeError when the timing is neither a valid cron nor a positive interval.
 */
export function nextOccurrence(timing: ScheduleTiming, after: Date): Date {
  if (typeof timing.cron === "string")
    return Cron.next(Cron.parseUnsafe(timing.cron, timing.timezone ?? "UTC"), after);
  const every = intervalMillis(timing.every);
  return new Date(after.getTime() + every);
}

/**
 * Selects the occurrences to enqueue now and the next pending occurrence.
 * @param timing - Schedule timing and misfire policy (default `latest`).
 * @param nextAt - Earliest occurrence not yet claimed.
 * @param now - Database time of this pass.
 * @returns Occurrences to claim, oldest first, and the following pending occurrence.
 */
export function dueOccurrences(
  timing: ScheduleTiming,
  nextAt: Date,
  now: Date,
): { readonly due: readonly Date[]; readonly next: Date } {
  const due: Date[] = [];
  let cursor = nextAt;
  while (cursor.getTime() <= now.getTime() && due.length < MAX_CATCH_UP) {
    due.push(cursor);
    cursor = nextOccurrence(timing, cursor);
  }
  while (cursor.getTime() <= now.getTime()) cursor = nextOccurrence(timing, cursor);
  return { due: select(timing.misfire ?? "latest", due, now), next: cursor };
}

/**
 * Applies the misfire policy to the due occurrences.
 * @param misfire - `all`, `latest` or `skip`.
 * @param due - Due occurrences, oldest first.
 * @param now - Database time of this pass.
 * @returns The occurrences to enqueue.
 */
function select(misfire: "skip" | "latest" | "all", due: readonly Date[], now: Date): Date[] {
  if (misfire === "all") return [...due];
  const latest = due.at(-1);
  if (latest === undefined) return [];
  if (misfire === "latest") return [latest];
  return now.getTime() - latest.getTime() <= ON_TIME_MS ? [latest] : [];
}

/**
 * Reads a positive interval.
 * @param value - Stored `every` duration (ms or duration text).
 * @returns Interval in ms.
 */
function intervalMillis(value: JsonValue | undefined): number {
  let millis = Number.NaN;
  if (typeof value === "number") millis = value;
  if (typeof value === "string")
    millis = durationToMillis(value as Parameters<typeof durationToMillis>[0]);
  if (!Number.isFinite(millis) || millis <= 0)
    throw new TypeError("Schedule needs a cron expression or a positive interval");
  return millis;
}
