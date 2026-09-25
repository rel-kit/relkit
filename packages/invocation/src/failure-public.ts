import { isJsonValue } from "@relkit/contracts";
import { Effect } from "effect";
import { normalizeFailureEffect, FailureNormalizationError } from "./failure-normalize.js";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type { PublicFailureEnvelope } from "./failure-public.types.js";

/** Shapes a failure for public transport without exposing internal causes.
 * @param value - Thrown or normalized failure.
 * @returns A safe envelope or tagged metadata error.
 * @example Effect.runSync(toPublicEnvelopeEffect(new Error("broken")));
 */
export function toPublicEnvelopeEffect(
  value: unknown,
): Effect.Effect<PublicFailureEnvelope, FailureNormalizationError> {
  return observeInvocation("failure.public-envelope", Effect.map(normalizeFailureEffect(value), (failure) => {
    const base = {
      kind: failure.kind,
      outcome: failure.outcome,
      code: failure.code,
      message: failure.message,
    };
    if (failure._tag !== "ApplicationFailure") return base;
    const data = isJsonValue(failure.data) ? failure.data : undefined;
    return {
      ...base,
      ...(data === undefined ? {} : { data }),
      ...(failure.status === undefined ? {} : { status: failure.status }),
      retry: failure.retry,
      ...(failure.afterMs === undefined ? {} : { afterMs: failure.afterMs }),
    };
  }));
}

/** Synchronous public envelope adapter.
 * @param value - Thrown or normalized failure.
 * @returns Public safe error metadata.
 * @throws TypeError for malformed declared failure metadata.
 * @example toPublicEnvelope(new Error("broken"));
 */
export function toPublicEnvelope(value: unknown): PublicFailureEnvelope {
  try { return runInvocationSync(toPublicEnvelopeEffect(value)); }
  catch (cause) {
    if (cause instanceof FailureNormalizationError) throw cause.cause;
    throw cause;
  }
}
