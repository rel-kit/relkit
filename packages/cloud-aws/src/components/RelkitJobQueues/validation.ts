import { assertJsonValue, canonicalJson, normalizeId, type JsonValue } from "@relkit/contracts";
import type {
  RelkitJobQueuesArgs,
  RelkitJobQueueDefinition,
  RelkitScheduleDefinition,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_VISIBILITY_SECONDS = 60;
const DEFAULT_RETENTION_SECONDS = 345_600;
const DEFAULT_DLQ_RETENTION_SECONDS = 1_209_600;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_WAIT_SECONDS = 20;
const DEFAULT_SCHEDULER_RETRIES = 3;
const DEFAULT_SCHEDULER_EVENT_AGE = 86_400;

export interface NormalizedJobQueue {
  readonly id: string;
  readonly retry: RelkitJobQueueDefinition["retry"];
  readonly timeoutMs: number;
  readonly concurrency: number;
  readonly visibilityTimeoutSeconds: number;
  readonly messageRetentionSeconds: number;
  readonly deadLetterRetentionSeconds: number;
  readonly maxReceiveCount: number;
  readonly workerBatchSize: number;
  readonly workerWaitTimeSeconds: number;
}

export interface NormalizedSchedule {
  readonly id: string;
  readonly jobId: string;
  readonly cron: string;
  readonly timezone: string;
  readonly input: JsonValue;
  readonly inputJson: string;
  readonly overlap: "skip" | "allow";
}

export interface NormalizedSchedulerRetryPolicy {
  readonly maximumRetryAttempts: number;
  readonly maximumEventAgeInSeconds: number;
}

export function normalizeJobs(args: RelkitJobQueuesArgs): NormalizedJobQueue[] {
  if (args.jobs.length === 0) throw new TypeError("At least one AWS job queue is required.");
  const ids = new Set<string>();
  return args.jobs.map((job) => {
    const id = normalizeId(job.id);
    if (ids.has(id)) throw new TypeError(`Duplicate AWS job queue \"${id}\".`);
    ids.add(id);
    validateRetry(job.retry, id);
    if (job.retry.maxAttempts > 1000)
      throw new RangeError(`Job \"${id}\" retry.maxAttempts cannot exceed 1000 on SQS.`);
    const timeoutMs = job.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    positive(timeoutMs, `Job \"${id}\" timeoutMs`);
    const requiredVisibility = Math.ceil(timeoutMs / 1000);
    const visibility =
      job.visibilityTimeoutSeconds ?? Math.max(DEFAULT_VISIBILITY_SECONDS, requiredVisibility);
    range(visibility, 0, 43_200, `Job \"${id}\" visibilityTimeoutSeconds`);
    if (visibility < requiredVisibility)
      throw new RangeError(`Job \"${id}\" visibilityTimeoutSeconds must cover timeoutMs.`);
    const retention = job.messageRetentionSeconds ?? DEFAULT_RETENTION_SECONDS;
    const dlqRetention = job.deadLetterRetentionSeconds ?? DEFAULT_DLQ_RETENTION_SECONDS;
    range(retention, 60, 1_209_600, `Job \"${id}\" messageRetentionSeconds`);
    range(dlqRetention, 60, 1_209_600, `Job \"${id}\" deadLetterRetentionSeconds`);
    if (dlqRetention < retention)
      throw new RangeError(`Job \"${id}\" dead-letter retention must cover source retention.`);
    const maxReceiveCount = job.maxReceiveCount ?? job.retry.maxAttempts;
    range(maxReceiveCount, 1, 1000, `Job \"${id}\" maxReceiveCount`);
    if (maxReceiveCount !== job.retry.maxAttempts)
      throw new RangeError(`Job \"${id}\" maxReceiveCount must equal retry.maxAttempts.`);
    const batchSize = job.workerBatchSize ?? args.workerBatchSize ?? DEFAULT_BATCH_SIZE;
    range(batchSize, 1, 10, `Job \"${id}\" workerBatchSize`);
    const waitSeconds =
      job.workerWaitTimeSeconds ?? args.workerWaitTimeSeconds ?? DEFAULT_WAIT_SECONDS;
    range(waitSeconds, 0, 20, `Job \"${id}\" workerWaitTimeSeconds`);
    const concurrency = job.concurrency ?? 1;
    positive(concurrency, `Job \"${id}\" concurrency`);
    return {
      id,
      retry: job.retry,
      timeoutMs,
      concurrency,
      visibilityTimeoutSeconds: visibility,
      messageRetentionSeconds: retention,
      deadLetterRetentionSeconds: dlqRetention,
      maxReceiveCount,
      workerBatchSize: batchSize,
      workerWaitTimeSeconds: waitSeconds,
    };
  });
}

export function normalizeSchedules(
  schedules: readonly RelkitScheduleDefinition[] | undefined,
  jobs: readonly NormalizedJobQueue[],
): NormalizedSchedule[] {
  if (schedules === undefined) return [];
  const jobIds = new Set(jobs.map((job) => job.id));
  const scheduleIds = new Set<string>();
  return schedules.map((schedule) => {
    const id = normalizeId(schedule.id);
    if (scheduleIds.has(id)) throw new TypeError(`Duplicate AWS schedule \"${id}\".`);
    scheduleIds.add(id);
    const jobId = normalizeId(schedule.jobId);
    if (!jobIds.has(jobId))
      throw new TypeError(`AWS schedule \"${id}\" references unknown job \"${jobId}\".`);
    const cron = schedule.cron.trim();
    if (cron.split(/\s+/).length !== 5)
      throw new TypeError(`AWS schedule \"${id}\" must use five-field cron.`);
    toAwsScheduleExpression(cron);
    const timezone = schedule.timezone.trim();
    if (timezone === "") throw new TypeError(`AWS schedule \"${id}\" timezone is required.`);
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    } catch {
      throw new TypeError(`AWS schedule \"${id}\" has an invalid timezone.`);
    }
    if (schedule.overlap !== "skip" && schedule.overlap !== "allow")
      throw new TypeError(`AWS schedule \"${id}\" overlap must be skip or allow.`);
    assertJsonValue(schedule.input);
    return {
      id,
      jobId,
      cron,
      timezone,
      input: schedule.input,
      inputJson: canonicalJson(schedule.input),
      overlap: schedule.overlap,
    };
  });
}

export function normalizeSchedulerRetry(
  policy: RelkitJobQueuesArgs["schedulerRetryPolicy"],
): NormalizedSchedulerRetryPolicy {
  const maximumRetryAttempts = policy?.maximumRetryAttempts ?? DEFAULT_SCHEDULER_RETRIES;
  const maximumEventAgeInSeconds = policy?.maximumEventAgeInSeconds ?? DEFAULT_SCHEDULER_EVENT_AGE;
  range(maximumRetryAttempts, 0, 185, "schedulerRetryPolicy.maximumRetryAttempts");
  range(maximumEventAgeInSeconds, 60, 86_400, "schedulerRetryPolicy.maximumEventAgeInSeconds");
  return { maximumRetryAttempts, maximumEventAgeInSeconds };
}

export function toAwsScheduleExpression(cron: string): string {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) throw new TypeError("AWS schedules require five-field cron.");
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  if (dayOfMonth === undefined || dayOfWeek === undefined)
    throw new TypeError("AWS schedules require five-field cron.");
  if (dayOfMonth !== "*" && dayOfWeek !== "*")
    throw new TypeError("AWS cron cannot constrain both day-of-month and day-of-week.");
  const awsDayOfMonth = dayOfMonth === "*" && dayOfWeek !== "*" ? "?" : dayOfMonth;
  const awsDayOfWeek = dayOfWeek === "*" ? "?" : dayOfWeek;
  return `cron(${minute} ${hour} ${awsDayOfMonth} ${month} ${awsDayOfWeek} *)`;
}

function validateRetry(policy: RelkitJobQueueDefinition["retry"], id: string): void {
  positive(policy.maxAttempts, `Job \"${id}\" retry.maxAttempts`);
  nonNegative(policy.initialDelayMs, `Job \"${id}\" retry.initialDelayMs`);
  nonNegative(policy.maxDelayMs, `Job \"${id}\" retry.maxDelayMs`);
  if (policy.maxDelayMs < policy.initialDelayMs)
    throw new RangeError(`Job \"${id}\" retry.maxDelayMs must cover initialDelayMs.`);
  if (!Number.isFinite(policy.multiplier) || policy.multiplier < 1)
    throw new RangeError(`Job \"${id}\" retry.multiplier must be finite and at least 1.`);
  if (policy.jitter !== "none" && policy.jitter !== "full" && policy.jitter !== "equal")
    throw new TypeError(`Job \"${id}\" retry.jitter is invalid.`);
}

function positive(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be positive.`);
}

function nonNegative(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError(`${name} must be non-negative.`);
}

function range(value: number, min: number, max: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new RangeError(`${name} must be an integer between ${min} and ${max}.`);
}
