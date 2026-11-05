/**
 * Derives Vercel Cron entries from the schedules in a compiled application graph. Vercel Cron only
 * wakes the deployment: every call runs one scheduler pass of the durable backend, which claims each
 * due occurrence once (unique on schedule and occurrence time) whatever cron entry or instance
 * triggered it. A UTC five-field cron expression is copied as is; any other timing (a timezone, an
 * interval, a seconds field) falls back to every minute so no occurrence is missed.
 */

/** Path prefix of the authenticated cron endpoint the function entry serves. */
export const VERCEL_CRON_PATH = "/_relkit/v1/vercel/cron";

/** One `crons` entry of `vercel.json`. */
export interface VercelCron {
  readonly path: string;
  readonly schedule: string;
}

/** A schedule whose timing Vercel Cron cannot express, so it wakes the deployment every minute. */
export interface VercelCronFallback {
  readonly job: string;
  readonly schedule: string;
  readonly reason: string;
}

/** Cron entries and the schedules that fell back to every minute. */
export interface VercelCronPlan {
  readonly crons: readonly VercelCron[];
  readonly fallbacks: readonly VercelCronFallback[];
}

/** The graph fields this derivation reads. */
interface ScheduleNode {
  readonly kind?: string;
  readonly id?: string;
  readonly schedules?: readonly {
    readonly id?: string;
    readonly cron?: string;
    readonly timezone?: string;
    readonly every?: unknown;
  }[];
}

const EVERY_MINUTE = "* * * * *";
const UTC_ZONES = new Set([undefined, "UTC", "Etc/UTC", "Z"]);
const CRON_FIELD = /^[0-9*,/-]+$/u;

/**
 * Plans the cron entries for every schedule in the graph, one entry per distinct expression.
 * @param graphText - Compiled application graph JSON.
 * @returns Entries sorted by path, and the schedules that run on the every-minute fallback.
 * @throws SyntaxError when the text is not JSON.
 */
export function vercelCronPlan(graphText: string): VercelCronPlan {
  const nodes = (JSON.parse(graphText) as { readonly nodes?: readonly ScheduleNode[] }).nodes ?? [];
  const byExpression = new Map<string, string>();
  const fallbacks: VercelCronFallback[] = [];
  const schedules = nodes
    .filter((node) => node.kind === "job" && typeof node.id === "string")
    .flatMap((job) =>
      (job.schedules ?? []).map((schedule, index) => ({
        job: job.id!,
        id: schedule.id ?? String(index),
        schedule,
      })),
    )
    .sort((left, right) =>
      `${left.job}/${left.id}`.localeCompare(`${right.job}/${right.id}`, "en"),
    );
  for (const { job, id, schedule } of schedules) {
    const reason = fallbackReason(schedule);
    const expression =
      reason === undefined ? schedule.cron!.trim().split(/\s+/u).join(" ") : EVERY_MINUTE;
    if (reason !== undefined) fallbacks.push({ job, schedule: id, reason });
    if (!byExpression.has(expression))
      byExpression.set(expression, `${VERCEL_CRON_PATH}/${segment(job)}/${segment(id)}`);
  }
  const crons = [...byExpression]
    .map(([schedule, path]) => ({ path, schedule }))
    .sort((left, right) => left.path.localeCompare(right.path, "en"));
  return { crons, fallbacks };
}

/**
 * Says why a schedule cannot be copied into Vercel Cron.
 * @param schedule - Schedule timing.
 * @param schedule.cron - Cron expression, if any.
 * @param schedule.timezone - IANA timezone, if any.
 * @returns The reason, or undefined for a UTC five-field cron expression.
 */
function fallbackReason(schedule: {
  readonly cron?: string;
  readonly timezone?: string;
}): string | undefined {
  if (typeof schedule.cron !== "string") return "an interval schedule";
  if (!UTC_ZONES.has(schedule.timezone)) return `timezone ${schedule.timezone}`;
  const fields = schedule.cron.trim().split(/\s+/u);
  if (fields.length !== 5 || !fields.every((field) => CRON_FIELD.test(field)))
    return `cron expression "${schedule.cron}" is not a numeric five-field expression`;
  return undefined;
}

/**
 * Makes an ID safe as a URL path segment.
 * @param value - Job or schedule ID.
 * @returns The ID with anything outside `[A-Za-z0-9._-]` replaced by `-`.
 */
function segment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/gu, "-");
}
