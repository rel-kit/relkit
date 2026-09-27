import type { JsonValue, TracePropagation } from "@relkit/contracts";
import { Effect } from "effect";
import type { CopiedTriggerOptions } from "./trigger-validation.js";
import {
  explicitOrDerivedKey as keyValue,
  boundedKey as boundedValue,
  scheduledTime as scheduledValue,
  currentCorrelation as correlationValue,
  propagationFor as propagationValue,
  currentTaskRunId as taskRunValue,
} from "./submission-support-value.js";
import { runSubmissionSupport, submissionSupportEffect } from "./submission-support-run.js";
/** Resolves an explicit or declared input idempotency key in Effect.
 * @param job - Job admission policy.
 * @param options - Validated trigger options.
 * @param input - Canonical task input.
 * @returns Key or SubmissionSupportFailure.
 * @example Effect.runSync(explicitOrDerivedKeyEffect(job, options, input));
 */
export const explicitOrDerivedKeyEffect = Effect.fn("Jobs.submissionIdempotencyKey")(
  (
    job: { readonly admission?: { readonly idempotency?: { readonly key?: string } } } | undefined,
    options: CopiedTriggerOptions,
    input: JsonValue | undefined,
  ) =>
    submissionSupportEffect("submissionSupport.idempotency", () => keyValue(job, options, input)),
);
/** Synchronous idempotency key resolver.
 * @param job - Job admission policy.
 * @param options - Validated trigger options.
 * @param input - Canonical task input.
 * @returns Key when present.
 * @throws TypeError for a mismatched or invalid scalar key.
 * @example explicitOrDerivedKey(job, options, input);
 */
export function explicitOrDerivedKey(
  job: { readonly admission?: { readonly idempotency?: { readonly key?: string } } } | undefined,
  options: CopiedTriggerOptions,
  input: JsonValue | undefined,
): string | undefined {
  return runSubmissionSupport(explicitOrDerivedKeyEffect(job, options, input));
}
/** Checks an idempotency key's encoded byte limit in Effect.
 * @param value - Candidate key.
 * @returns Bounded key or SubmissionSupportFailure.
 * @example Effect.runSync(boundedKeyEffect("order-1"));
 */
export const boundedKeyEffect = Effect.fn("Jobs.boundSubmissionKey")((value: string) =>
  submissionSupportEffect("submissionSupport.boundedKey", () => boundedValue(value)),
);
/** Synchronous bounded idempotency key.
 * @param value - Candidate key.
 * @returns The key when valid.
 * @throws TypeError when over 256 UTF-8 bytes.
 * @example boundedKey("order-1");
 */
export function boundedKey(value: string): string {
  return runSubmissionSupport(boundedKeyEffect(value));
}
/** Calculates an absolute scheduled submission time in Effect.
 * @param options - Validated trigger options.
 * @param now - Current epoch milliseconds.
 * @returns RFC3339 instant when scheduled or SubmissionSupportFailure.
 * @example Effect.runSync(scheduledTimeEffect(options, Date.now()));
 */
export const scheduledTimeEffect = Effect.fn("Jobs.submissionScheduledTime")(
  (options: CopiedTriggerOptions, now: number) =>
    submissionSupportEffect("submissionSupport.scheduledTime", () => scheduledValue(options, now)),
);
/** Synchronous absolute scheduled time calculator.
 * @param options - Validated trigger options.
 * @param now - Current epoch milliseconds.
 * @returns RFC3339 instant when scheduled.
 * @throws Original invalid duration error.
 * @example scheduledTime(options, Date.now());
 */
export function scheduledTime(options: CopiedTriggerOptions, now: number): string | undefined {
  return runSubmissionSupport(scheduledTimeEffect(options, now));
}
/** Reads request correlation from the invocation scope in Effect.
 * @returns Correlation id when present; no expected failure.
 * @example Effect.runSync(currentCorrelationEffect());
 */
export const currentCorrelationEffect = Effect.fn("Jobs.currentSubmissionCorrelation")(() =>
  submissionSupportEffect("submissionSupport.correlation", correlationValue),
);
/** Synchronous request correlation reader.
 * @returns Correlation id when present.
 * @example currentCorrelation();
 */
export function currentCorrelation(): string | undefined {
  return runSubmissionSupport(currentCorrelationEffect());
}
/** Extends trace propagation with request correlation in Effect.
 * @param correlationId - Optional request correlation.
 * @returns Frozen propagation when present; no expected failure.
 * @example Effect.runSync(propagationForEffect("request-1"));
 */
export const propagationForEffect = Effect.fn("Jobs.submissionPropagation")(
  (correlationId: string | undefined) =>
    submissionSupportEffect("submissionSupport.propagation", () => propagationValue(correlationId)),
);
/** Synchronous correlated trace propagation reader.
 * @param correlationId - Optional request correlation.
 * @returns Frozen propagation when present.
 * @example propagationFor("request-1");
 */
export function propagationFor(correlationId: string | undefined): TracePropagation | undefined {
  return runSubmissionSupport(propagationForEffect(correlationId));
}
/** Reads the current parent task run id in Effect.
 * @returns Parent run id when present; no expected failure.
 * @example Effect.runSync(currentTaskRunIdEffect());
 */
export const currentTaskRunIdEffect = Effect.fn("Jobs.currentTaskRunId")(() =>
  submissionSupportEffect("submissionSupport.parentRun", taskRunValue),
);
/** Synchronous current parent task run id reader.
 * @returns Parent run id when present.
 * @example currentTaskRunId();
 */
export function currentTaskRunId(): string | undefined {
  return runSubmissionSupport(currentTaskRunIdEffect());
}
