import { durationToMillis } from "@relkit/jobs";

export interface InngestPolicyMapping {
  readonly retries?: number;
  readonly timeoutSeconds?: number;
  readonly concurrency?: number;
}

/** Maps only fields whose semantics are certified by the pinned Inngest profile. */
export function mapInngestPolicy(value: unknown): InngestPolicyMapping {
  if (value === undefined) return Object.freeze({});
  const policy = record(value, "Inngest task policy");
  const allowed = new Set(["retry", "maxDuration", "concurrency"]);
  for (const key of Object.keys(policy)) {
    if (!allowed.has(key)) throw new Error(`Inngest cannot certify task policy field "${key}".`);
  }
  const retry = policy.retry === undefined ? undefined : mapRetry(policy.retry);
  const timeoutSeconds = policy.maxDuration === undefined ? undefined : seconds(policy.maxDuration);
  const concurrency = policy.concurrency === undefined ? undefined : limit(policy.concurrency);
  return Object.freeze({
    ...(retry === undefined ? {} : { retries: retry }),
    ...(timeoutSeconds === undefined ? {} : { timeoutSeconds }),
    ...(concurrency === undefined ? {} : { concurrency }),
  });
}

function mapRetry(value: unknown): number {
  const retry = record(value, "Inngest retry policy");
  const maxAttempts = retry.maxAttempts;
  if (typeof maxAttempts !== "number" || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1) throw new TypeError("Inngest retry.maxAttempts is invalid");
  const attempts = maxAttempts;
  if (retry.initialDelay !== undefined && duration(retry.initialDelay) !== 1_000) throw new Error("Inngest cannot certify custom retry initialDelay.");
  if (retry.maxDelay !== undefined && duration(retry.maxDelay) !== 30_000) throw new Error("Inngest cannot certify custom retry maxDelay.");
  if (retry.factor !== undefined && retry.factor !== 2) throw new Error("Inngest cannot certify custom retry factor.");
  if (retry.jitter !== undefined && retry.jitter !== "none") throw new Error("Inngest cannot certify retry jitter.");
  return attempts - 1;
}

function duration(value: unknown): number {
  if (typeof value !== "string") throw new TypeError("Inngest retry delay is invalid");
  try {
    return durationToMillis(value as never);
  } catch {
    throw new TypeError("Inngest retry delay is invalid");
  }
}

function seconds(value: unknown): number {
  if (typeof value !== "string") throw new TypeError("Inngest maxDuration must be a duration string");
  let milliseconds: number;
  try {
    milliseconds = durationToMillis(value as never);
  } catch {
    throw new TypeError("Inngest maxDuration is invalid");
  }
  if (milliseconds < 1 || milliseconds % 1_000 !== 0) throw new Error("Inngest maxDuration must be whole seconds");
  return milliseconds / 1_000;
}

function limit(value: unknown): number {
  const concurrency = record(value, "Inngest concurrency");
  if (typeof concurrency.limit !== "number" || !Number.isSafeInteger(concurrency.limit) || concurrency.limit < 1) throw new TypeError("Inngest concurrency.limit is invalid");
  if (concurrency.key !== undefined) throw new Error("Inngest cannot certify keyed task concurrency in this profile.");
  return concurrency.limit;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} is invalid`);
  return value as Record<string, unknown>;
}
