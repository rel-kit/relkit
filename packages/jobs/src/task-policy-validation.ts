import { durationToMillis } from "./duration.js";
import { getJsonSchema, type StandardSchemaV1 } from "@relkit/schema";
import type {
  NormalizedTaskRetryPolicy,
  TaskConcurrency,
  TaskLogging,
  TaskResources,
} from "./task-types.js";

export const TASK_INPUT_MAX_BYTES = 1_048_576;
export const TASK_OUTPUT_MAX_BYTES = 1_048_576;
export const TASK_ITEM_MAX_BYTES = 64 * 1024;
export const TASK_KEY_MAX_BYTES = 256;
export const TASK_REASON_MAX_BYTES = 1_024;
export const TASK_MAX_TAGS = 20;

const MEMORY_PATTERN = /^(\d+)(?:\.(\d+))? (MiB|GiB)$/u;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MEMORY_UNITS = { MiB: 1_048_576n, GiB: 1_073_741_824n } as const;

export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function assertBoundedString(
  value: unknown,
  name: string,
  maxBytes = TASK_KEY_MAX_BYTES,
): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || utf8Bytes(value) > maxBytes) {
    throw new TypeError(`${name} must be a non-empty string of at most ${maxBytes} UTF-8 bytes`);
  }
}

export function assertFieldName(value: unknown, name = "field name"): asserts value is string {
  assertBoundedString(value, name);
  if (/[.\[\](){}$\s]/u.test(value)) {
    throw new TypeError(`${name} must identify one top-level field, not a path or expression`);
  }
}

export function memoryBytes(value: string): number {
  const match = MEMORY_PATTERN.exec(value);
  if (!match || value.length > 128) throw new TypeError("Memory must be a decimal MiB or GiB value");
  const whole = match[1];
  const fraction = match[2] ?? "";
  const unit = match[3] as keyof typeof MEMORY_UNITS;
  const scale = 10n ** BigInt(fraction.length);
  const amount = BigInt(whole!) * scale + BigInt(fraction || "0");
  const bytesNumerator = amount * MEMORY_UNITS[unit];
  if (bytesNumerator % scale !== 0n) throw new TypeError("Memory must resolve to an exact byte count");
  const bytes = bytesNumerator / scale;
  if (bytes < 1n || bytes > MAX_SAFE) throw new TypeError("Memory is outside the safe byte range");
  return Number(bytes);
}

export function retryDelayMillis(
  policy: NormalizedTaskRetryPolicy,
  attempt: number,
  retryAfterMillis = 0,
  random = Math.random,
): number {
  if (!Number.isSafeInteger(attempt) || attempt < 1) throw new TypeError("attempt must be positive");
  if (!Number.isSafeInteger(retryAfterMillis) || retryAfterMillis < 0) {
    throw new TypeError("retry-after must be a non-negative safe integer");
  }
  const initial = durationToMillis(policy.initialDelay);
  const maximum = durationToMillis(policy.maxDelay);
  let cap = initial;
  for (let index = 1; index < attempt && cap < maximum; index += 1) {
    cap = cap > maximum / policy.factor ? maximum : Math.min(maximum, Math.floor(cap * policy.factor));
  }
  if (policy.jitter === "none") return Math.max(cap, retryAfterMillis);
  const sample = random();
  if (!Number.isFinite(sample)) throw new TypeError("jitter sample must be finite");
  const delay = Math.min(cap, Math.max(0, Math.floor(sample * (cap + 1))));
  return Math.max(delay, retryAfterMillis);
}

export function copyTaskTags(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > TASK_MAX_TAGS) {
    throw new TypeError(`Task tags must contain at most ${TASK_MAX_TAGS} entries`);
  }
  const tags = value.map((tag) => {
    assertBoundedString(tag, "Task tag");
    return tag;
  });
  if (new Set(tags).size !== tags.length) throw new TypeError("Task tags must be unique");
  return Object.freeze(tags);
}

export function copyResources(value: unknown): TaskResources | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || typeof value.cpu !== "number" || !Number.isFinite(value.cpu) || value.cpu <= 0) {
    throw new TypeError("resources.cpu must be a positive finite number");
  }
  if (typeof value.memory !== "string") {
    throw new TypeError("resources.memory must be a positive MiB or GiB duration");
  }
  memoryBytes(value.memory);
  return Object.freeze({ cpu: value.cpu, memory: value.memory as TaskResources["memory"] });
}

export function copyConcurrency(
  value: unknown,
  canonicalSchema?: StandardSchemaV1,
): TaskConcurrency | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new TypeError("Task concurrency must be an object");
  const limit = value.limit;
  if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1) {
    throw new TypeError("concurrency.limit must be a positive integer");
  }
  const key = value.key;
  if (key !== undefined) {
    assertFieldName(key, "concurrency.key");
    if (canonicalSchema !== undefined) assertCanonicalScalarKey(canonicalSchema, key, "concurrency.key");
  }
  return Object.freeze({ limit, ...(key === undefined ? {} : { key }) });
}

export function assertCanonicalScalarKey(schema: StandardSchemaV1, key: string, name: string): void {
  const projection = getJsonSchema(schema, { direction: "output" });
  if (!projection.ok || !isRecord(projection.schema.properties) || !Array.isArray(projection.schema.required)) {
    throw new TypeError(`${name} requires a projected canonical object schema`);
  }
  if (!projection.schema.required.includes(key)) {
    throw new TypeError(`${name} must identify a required canonical field`);
  }
  const field = projection.schema.properties[key];
  if (!isRecord(field) || (field.type !== "string" && field.type !== "number" && field.type !== "integer")) {
    throw new TypeError(`${name} must identify a canonical string or number field`);
  }
}

export function copyLogging(value: unknown): TaskLogging | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new TypeError("Task logging must be an object");
  if (value.level !== undefined && !["trace", "debug", "info", "warn", "error"].includes(value.level as string)) {
    throw new TypeError("logging.level is invalid");
  }
  if (value.redact !== undefined && !Array.isArray(value.redact)) {
    throw new TypeError("logging.redact must be an array of strings");
  }
  const redact = value.redact?.map((entry) => {
    assertBoundedString(entry, "logging.redact entry");
    return entry;
  });
  if (redact !== undefined && new Set(redact).size !== redact.length) {
    throw new TypeError("logging.redact entries must be unique");
  }
  return Object.freeze({
    ...(value.level === undefined ? {} : { level: value.level }),
    ...(redact === undefined ? {} : { redact: Object.freeze(redact) }),
  }) as TaskLogging;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
