import { isRef } from "@relkit/contracts";
import { assertBoundedString, copyTaskTags } from "./task-policy-validation.js";
import { duration } from "./task-validation.js";
import { assertRfc3339Instant } from "./instant-validation.js";
import type { RunResultOptions, ServerTriggerOptions } from "./trigger-types.js";

export type CopiedTriggerOptions = ServerTriggerOptions & { readonly job?: unknown };

const TRIGGER_OPTION_KEYS = new Set([
  "operationId",
  "idempotencyKey",
  "delay",
  "at",
  "tags",
  "correlationId",
  "signal",
  "job",
]);

export function copyTriggerOptions(value: unknown): CopiedTriggerOptions {
  if (!isRecord(value)) throw new TypeError("Trigger options must be an object");
  assertKnownKeys(value, TRIGGER_OPTION_KEYS, "Trigger options");
  const hasDelay = hasOwn(value, "delay");
  const hasAt = hasOwn(value, "at");
  if (hasDelay && hasAt) throw new TypeError("Trigger options cannot specify both delay and at");
  const at = hasAt ? validInstant(value.at) : undefined;
  const operationId = copyText(value.operationId, "trigger.operationId");
  const idempotencyKey = copyText(value.idempotencyKey, "trigger.idempotencyKey");
  const correlationId = copyText(value.correlationId, "trigger.correlationId");
  const delay = hasDelay ? duration(value.delay, "trigger.delay") : undefined;
  const tags = copyTaskTags(value.tags);
  if (value.signal !== undefined && !isAbortSignal(value.signal)) {
    throw new TypeError("trigger.signal must be an AbortSignal");
  }
  if (value.job !== undefined) assertJobSelector(value.job);
  return Object.freeze({
    ...(operationId === undefined ? {} : { operationId }),
    ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    ...(delay === undefined ? {} : { delay }),
    ...(at === undefined ? {} : { at }),
    ...(tags === undefined ? {} : { tags }),
    ...(correlationId === undefined ? {} : { correlationId }),
    ...(value.signal === undefined ? {} : { signal: value.signal }),
    ...(value.job === undefined ? {} : { job: value.job }),
  });
}

export function validateResultOptions(value: unknown): RunResultOptions {
  if (!isRecord(value) || !hasOwn(value, "timeout")) {
    throw new TypeError("runs.result requires a finite positive timeout");
  }
  assertKnownKeys(value, new Set(["timeout", "signal"]), "Result options");
  const timeout = duration(value.timeout, "result.timeout", true);
  if (value.signal !== undefined && !isAbortSignal(value.signal)) {
    throw new TypeError("result.signal must be an AbortSignal");
  }
  return Object.freeze({
    timeout,
    ...(value.signal === undefined ? {} : { signal: value.signal }),
  });
}

function copyText(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  assertBoundedString(value, name);
  if (/\s/u.test(value)) throw new TypeError(`${name} must not contain whitespace`);
  return value;
}

function validInstant(value: unknown): string {
  assertRfc3339Instant(value, "trigger.at");
  return value;
}

function assertJobSelector(value: unknown): void {
  if (!isRecord(value) || !isRef(value.ref, "job") || !isRecord(value.task)) {
    throw new TypeError("trigger.job must be a job descriptor for a task");
  }
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return (
    isRecord(value) &&
    typeof value.aborted === "boolean" &&
    typeof value.addEventListener === "function" &&
    typeof value.removeEventListener === "function"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertKnownKeys(value: object, allowed: ReadonlySet<string>, name: string): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key)) {
      throw new TypeError(`${name} contains unsupported field "${String(key)}"`);
    }
  }
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
