import { canonicalJson, normalizeId } from "@zsys/contracts";
import type {
  ZsysEventBridgeRetryPolicy,
  ZsysEventBusArgs,
  ZsysEventDefinition,
  ZsysEventRetryPolicy,
  ZsysEventTriggerDefinition,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_VISIBILITY_SECONDS = 60;
const DEFAULT_RETENTION_SECONDS = 345_600;
const DEFAULT_DLQ_RETENTION_SECONDS = 1_209_600;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_WAIT_SECONDS = 20;
const DEFAULT_EVENTBRIDGE_RETRIES = 3;
const DEFAULT_EVENTBRIDGE_AGE = 86_400;
const DEFAULT_TRIGGER_RETRY: ZsysEventRetryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 30_000,
  multiplier: 2,
  jitter: "none",
};

export interface NormalizedEvent {
  readonly id: string;
  readonly version: number;
  readonly pair: string;
}

export interface NormalizedEventTrigger {
  readonly id: string;
  readonly targetFunctionId: string;
  readonly expansion: readonly NormalizedEvent[];
  readonly retry: ZsysEventRetryPolicy;
  readonly timeoutMs: number;
  readonly concurrency: number;
  readonly visibilityTimeoutSeconds: number;
  readonly messageRetentionSeconds: number;
  readonly deadLetterRetentionSeconds: number;
  readonly maxReceiveCount: number;
  readonly workerBatchSize: number;
  readonly workerWaitTimeSeconds: number;
}

export interface NormalizedEventBridgeRetryPolicy {
  readonly maximumRetryAttempts: number;
  readonly maximumEventAgeInSeconds: number;
}

export function normalizeEvents(events: readonly ZsysEventDefinition[]): NormalizedEvent[] {
  const seen = new Set<string>();
  return events.map((event) => {
    const id = normalizeId(event.id);
    if (!Number.isSafeInteger(event.version) || event.version < 1)
      throw new RangeError(`Event "${id}" version must be a positive integer.`);
    const pair = `${id}@${event.version}`;
    if (seen.has(pair)) throw new TypeError(`Duplicate AWS event version "${pair}".`);
    seen.add(pair);
    return { id, version: event.version, pair };
  });
}

export function normalizeTriggers(
  args: ZsysEventBusArgs,
  events: readonly NormalizedEvent[],
): NormalizedEventTrigger[] {
  if (args.eventTriggers !== undefined && args.triggers !== undefined)
    throw new TypeError("Specify eventTriggers or triggers, not both.");
  const definitions = args.eventTriggers ?? args.triggers ?? [];
  const known = new Map(events.map((event) => [event.pair, event]));
  const ids = new Set<string>();
  return definitions.map((trigger) => {
    const id = normalizeId(trigger.id);
    if (ids.has(id)) throw new TypeError(`Duplicate AWS event trigger "${id}".`);
    ids.add(id);
    const expansion = [...new Set(trigger.expansion.map(parsePair))]
      .map((pair) => {
        const event = known.get(pair);
        if (event === undefined)
          throw new TypeError(`AWS event trigger "${id}" references unknown event "${pair}".`);
        return event;
      })
      .sort((left, right) => left.pair.localeCompare(right.pair));
    if (expansion.length === 0)
      throw new TypeError(`AWS event trigger "${id}" must route at least one event version.`);
    const retry = trigger.retry ?? DEFAULT_TRIGGER_RETRY;
    validateRetry(retry, id);
    if (retry.maxAttempts > 1000)
      throw new RangeError(`Event trigger "${id}" retry.maxAttempts cannot exceed 1000.`);
    const timeoutMs = trigger.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    positive(timeoutMs, `Event trigger "${id}" timeoutMs`);
    const requiredVisibility = Math.ceil(timeoutMs / 1000);
    const visibility =
      trigger.visibilityTimeoutSeconds ?? Math.max(DEFAULT_VISIBILITY_SECONDS, requiredVisibility);
    range(visibility, 0, 43_200, `Event trigger "${id}" visibilityTimeoutSeconds`);
    if (visibility < requiredVisibility)
      throw new RangeError(`Event trigger "${id}" visibilityTimeoutSeconds must cover timeoutMs.`);
    const retention = trigger.messageRetentionSeconds ?? DEFAULT_RETENTION_SECONDS;
    const dlqRetention = trigger.deadLetterRetentionSeconds ?? DEFAULT_DLQ_RETENTION_SECONDS;
    range(retention, 60, 1_209_600, `Event trigger "${id}" messageRetentionSeconds`);
    range(dlqRetention, 60, 1_209_600, `Event trigger "${id}" deadLetterRetentionSeconds`);
    if (dlqRetention < retention)
      throw new RangeError(
        `Event trigger "${id}" dead-letter retention must cover source retention.`,
      );
    const maxReceiveCount = trigger.maxReceiveCount ?? retry.maxAttempts;
    range(maxReceiveCount, 1, 1000, `Event trigger "${id}" maxReceiveCount`);
    if (maxReceiveCount !== retry.maxAttempts)
      throw new RangeError(`Event trigger "${id}" maxReceiveCount must equal retry.maxAttempts.`);
    const batchSize = trigger.workerBatchSize ?? DEFAULT_BATCH_SIZE;
    range(batchSize, 1, 10, `Event trigger "${id}" workerBatchSize`);
    const waitSeconds = trigger.workerWaitTimeSeconds ?? DEFAULT_WAIT_SECONDS;
    range(waitSeconds, 0, 20, `Event trigger "${id}" workerWaitTimeSeconds`);
    const concurrency = trigger.concurrency ?? 1;
    positive(concurrency, `Event trigger "${id}" concurrency`);
    return {
      id,
      targetFunctionId: normalizeId(trigger.targetFunctionId),
      expansion,
      retry,
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

export function normalizeEventBridgeRetry(
  policy: ZsysEventBusArgs["eventBridgeRetryPolicy"],
): NormalizedEventBridgeRetryPolicy {
  const maximumRetryAttempts = policy?.maximumRetryAttempts ?? DEFAULT_EVENTBRIDGE_RETRIES;
  const maximumEventAgeInSeconds = policy?.maximumEventAgeInSeconds ?? DEFAULT_EVENTBRIDGE_AGE;
  range(maximumRetryAttempts, 0, 185, "eventBridgeRetryPolicy.maximumRetryAttempts");
  range(maximumEventAgeInSeconds, 60, 86_400, "eventBridgeRetryPolicy.maximumEventAgeInSeconds");
  return { maximumRetryAttempts, maximumEventAgeInSeconds };
}

export function normalizeSource(source: string | undefined): string {
  const value = source?.trim() ?? "zsys";
  if (value === "" || value.length > 256)
    throw new TypeError("eventSource must be 1-256 characters.");
  return value;
}

export function eventPattern(source: string, event: NormalizedEvent): string {
  return canonicalJson({
    "detail-type": [event.id],
    detail: { eventId: [event.id], version: [event.version] },
    source: [source],
  });
}

function parsePair(value: string): string {
  const at = value.lastIndexOf("@");
  const versionText = value.slice(at + 1);
  if (at < 1 || !/^[1-9]\d*$/.test(versionText))
    throw new TypeError(`Event expansion "${value}" must use id@version.`);
  const version = Number(versionText);
  return `${normalizeId(value.slice(0, at))}@${version}`;
}

function validateRetry(policy: ZsysEventRetryPolicy, id: string): void {
  positive(policy.maxAttempts, `Event trigger "${id}" retry.maxAttempts`);
  nonNegative(policy.initialDelayMs, `Event trigger "${id}" retry.initialDelayMs`);
  nonNegative(policy.maxDelayMs, `Event trigger "${id}" retry.maxDelayMs`);
  if (policy.maxDelayMs < policy.initialDelayMs)
    throw new RangeError(`Event trigger "${id}" retry.maxDelayMs must cover initialDelayMs.`);
  if (!Number.isFinite(policy.multiplier) || policy.multiplier < 1)
    throw new RangeError(`Event trigger "${id}" retry.multiplier must be finite and at least 1.`);
  if (policy.jitter !== "none" && policy.jitter !== "full" && policy.jitter !== "equal")
    throw new TypeError(`Event trigger "${id}" retry.jitter is invalid.`);
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
