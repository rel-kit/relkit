import { isRef } from "@relkit/contracts";
import { Effect, Result, Schema } from "effect";
import { assertBoundedString, copyTaskTags } from "./task-policy-validation.js";
import { duration } from "./task-validation.js";
import { assertRfc3339Instant } from "./instant-validation.js";
import type { RunResultOptions } from "./trigger.types.js";
import type { CopiedTriggerOptions } from "./trigger-validation.types.js";
import { observeJobs } from "./jobs-observability.js";
export type { CopiedTriggerOptions } from "./trigger-validation.types.js";
/** Invalid trigger or result observation options.
 * @example if (error instanceof TriggerValidationError) console.log(error.message);
 */
export class TriggerValidationError extends Schema.TaggedError<TriggerValidationError>()(
  "Jobs.TriggerValidationError",
  { reason: Schema.String },
) {}
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
/** Validates and freezes trigger options in Effect.
 * @param value - Untrusted trigger options.
 * @returns Copied options or TriggerValidationError.
 * @example Effect.runSync(copyTriggerOptionsEffect({ operationId: "op" }));
 */
export const copyTriggerOptionsEffect = Effect.fn("Jobs.copyTriggerOptions")((value: unknown) =>
  observeJobs(
    "trigger.copyOptions",
    triggerTry(() => copyTriggerValue(value)),
  ),
);
/** Synchronous trigger options validator.
 * @param value - Untrusted trigger options.
 * @returns Frozen options.
 * @throws TypeError for invalid fields.
 * @example copyTriggerOptions({ operationId: "op" });
 */
export function copyTriggerOptions(value: unknown): CopiedTriggerOptions {
  return runTrigger(copyTriggerOptionsEffect(value));
}
function copyTriggerValue(value: unknown): CopiedTriggerOptions {
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
/** Validates bounded result observation options in Effect.
 * @param value - Untrusted result options.
 * @returns Validated options or TriggerValidationError.
 * @example Effect.runSync(validateResultOptionsEffect({ timeout: "1 second" }));
 */
export const validateResultOptionsEffect = Effect.fn("Jobs.validateResultOptions")(
  (value: unknown) =>
    observeJobs(
      "trigger.resultOptions",
      triggerTry(() => validateResultValue(value)),
    ),
);
/** Synchronous result options validator.
 * @param value - Untrusted result options.
 * @returns Frozen result options.
 * @throws TypeError for invalid fields.
 * @example validateResultOptions({ timeout: "1 second" });
 */
export function validateResultOptions(value: unknown): RunResultOptions {
  return runTrigger(validateResultOptionsEffect(value));
}
function validateResultValue(value: unknown): RunResultOptions {
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
function triggerTry<A>(compute: () => A): Effect.Effect<A, TriggerValidationError> {
  return Effect.try({
    try: compute,
    catch: (error) => {
      if (error instanceof Error) return new TriggerValidationError({ reason: error.message });
      throw error;
    },
  });
}
function runTrigger<A>(effect: Effect.Effect<A, TriggerValidationError>): A {
  const result = Effect.runSync(Effect.result(effect));
  if (Result.isFailure(result)) throw new TypeError(result.failure.reason);
  return result.success;
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
