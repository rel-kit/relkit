import { normalizeId } from "@relkit/contracts";
import type { RetryPolicy } from "@relkit/jobs/legacy";
import type { EventDelivery } from "./event-function.types.js";
import { Effect } from "effect";
import { EventDefinitionError } from "./event-errors.js";
import { observeEvent, runEventSync } from "./event-observability.js";

const DEFAULT_RETRY: RetryPolicy = Object.freeze({
  maxAttempts: 1,
  initialDelayMs: 0,
  maxDelayMs: 0,
  multiplier: 1,
  jitter: "none",
});

/** Normalizes event delivery for synchronous authoring.
 * @param value - Optional delivery mode.
 * @returns The selected delivery mode.
 * @throws TypeError for an unsupported mode.
 * @example eventDelivery("durable")
 */
export function eventDelivery(value: unknown): EventDelivery {
  return runValidation(eventDeliveryEffect(value));
}

/** Resolves an event function delivery mode.
 * @param value - Optional delivery mode.
 * @returns The mode or a typed definition failure.
 * @example Effect.runSync(eventDeliveryEffect("durable"))
 */
export const eventDeliveryEffect = Effect.fn("Events.functionDelivery")((value: unknown) =>
  observeEvent(
    "function.delivery",
    validate(() => delivery(value)),
  ),
);

function delivery(value: unknown): EventDelivery {
  if (value === undefined) return "durable";
  if (value !== "ephemeral" && value !== "durable") {
    throw new TypeError("Event function delivery must be ephemeral or durable");
  }
  return value;
}

/** Normalizes a synchronous event provider profile.
 * @param value - Optional profile.
 * @returns Stable profile name.
 * @throws TypeError for a malformed profile.
 * @example eventProfile("default")
 */
export function eventProfile(value: unknown): string {
  return runValidation(eventProfileEffect(value));
}

/** Resolves the configured event provider profile.
 * @param value - Optional profile name.
 * @returns The stable profile or a typed definition failure.
 * @example Effect.runSync(eventProfileEffect("default"))
 */
export const eventProfileEffect = Effect.fn("Events.functionProfile")((value: unknown) =>
  observeEvent(
    "function.profile",
    validate(() => profile(value)),
  ),
);

function profile(value: unknown): string {
  if (value === undefined) return "default";
  if (typeof value !== "string") throw new TypeError("Event function profile must be a string");
  return normalizeId(value);
}

/** Normalizes synchronous event retry policy input.
 * @param value - Optional retry policy.
 * @returns A frozen policy with validated bounds.
 * @throws TypeError for invalid retry values.
 * @example eventRetry({ maxAttempts: 3 })
 */
export function eventRetry(value: unknown): RetryPolicy {
  return runValidation(eventRetryEffect(value));
}

/** Normalizes an event function retry policy.
 * @param value - Optional retry policy.
 * @returns The frozen policy or a typed definition failure.
 * @example Effect.runSync(eventRetryEffect({ maxAttempts: 3 }))
 */
export const eventRetryEffect = Effect.fn("Events.functionRetry")((value: unknown) =>
  observeEvent(
    "function.retry",
    validate(() => retryPolicy(value)),
  ),
);

function retryPolicy(value: unknown): RetryPolicy {
  if (value === undefined) return DEFAULT_RETRY;
  if (!isRecord(value)) throw new TypeError("Event function retry must be an object");
  const retry = { ...DEFAULT_RETRY, ...value } as RetryPolicy;
  positive(retry.maxAttempts, "retry.maxAttempts");
  nonNegative(retry.initialDelayMs, "retry.initialDelayMs");
  nonNegative(retry.maxDelayMs, "retry.maxDelayMs");
  if (retry.maxDelayMs < retry.initialDelayMs) {
    throw new TypeError("retry.maxDelayMs must be at least retry.initialDelayMs");
  }
  if (!Number.isFinite(retry.multiplier) || retry.multiplier < 1) {
    throw new TypeError("retry.multiplier must be a finite number at least 1");
  }
  if (retry.jitter !== "none" && retry.jitter !== "full" && retry.jitter !== "equal") {
    throw new TypeError("retry.jitter must be none, full, or equal");
  }
  return Object.freeze(retry);
}

/** Rejects descriptor fields reserved for other function kinds.
 * @param options - Event function options.
 * @returns Void when no forbidden field is present.
 * @throws TypeError when a forbidden field is present.
 * @example rejectEventFunctionFields({ event: "orders.created" })
 */
export function rejectEventFunctionFields(options: Record<PropertyKey, unknown>): void {
  runValidation(rejectEventFunctionFieldsEffect(options));
}

/** Rejects fields owned by other descriptor kinds.
 * @param options - Candidate function fields.
 * @returns Void or a typed definition failure.
 * @example Effect.runSync(rejectEventFunctionFieldsEffect({ event: "orders.created" }))
 */
export const rejectEventFunctionFieldsEffect = Effect.fn("Events.rejectFunctionFields")(
  (options: Record<PropertyKey, unknown>) =>
    observeEvent(
      "function.rejectFields",
      validate(() => rejectFields(options)),
    ),
);

function rejectFields(options: Record<PropertyKey, unknown>): void {
  for (const field of ["input", "output", "tool", "trigger"] as const) {
    if (Object.hasOwn(options, field))
      throw new TypeError(`Event functions cannot declare ${field}`);
  }
}

function validate<A>(work: () => A): Effect.Effect<A, EventDefinitionError> {
  return Effect.try({
    try: work,
    catch: (cause) =>
      new EventDefinitionError({
        message: cause instanceof Error ? cause.message : "Invalid event function",
      }),
  });
}

function runValidation<A>(effect: Effect.Effect<A, EventDefinitionError>): A {
  try {
    return runEventSync(effect);
  } catch (error) {
    if (error instanceof EventDefinitionError) throw new TypeError(error.message);
    throw error;
  }
}

function positive(value: unknown, name: string): void {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new TypeError(`${name} must be a positive integer`);
  }
}

function nonNegative(value: unknown, name: string): void {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new TypeError(`${name} must be a non-negative integer`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
