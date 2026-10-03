import { InvocationValidationError } from "@relkit/engine";
import { publicTrace } from "@relkit/invocation";
import type { RequestOutcome, RequestRecordBuilder } from "@relkit/observability";
import { normalizeFailure } from "@relkit/runtime-effect";
import { invokeHttpEngine } from "./http-invocation.js";
import type { HttpEngine, HttpInvocationOptions } from "./materialize-routes.js";
import { isRequestMappingFailure } from "./request-mapping.js";

/** Adds an attributed stage detail to the active request record when collection is enabled.
 * @param builder - Optional request-record builder receiving stage details.
 * @param detail - Bounded attributed stage metadata to append.
 * @returns Nothing; the requested update is applied to the owned state.
 */
export function recordDetail(
  builder: RequestRecordBuilder | undefined,
  detail: Parameters<RequestRecordBuilder["add"]>[0],
): void {
  builder?.add(detail);
}

/** Classifies an invocation failure for HTTP telemetry while preserving cancellation authority.
 * @param value - Value inspected, validated or projected by this operation.
 * @param signal - Cancellation signal inherited from the caller or owning scope.
 * @returns The request outcome and any public application error ID.
 */
export function failureOutcome(
  value: unknown,
  signal?: AbortSignal,
): { readonly outcome: RequestOutcome; readonly errorId?: string } {
  if (value instanceof InvocationValidationError) {
    return { outcome: value.phase === "input" ? "validation-error" : "defect" };
  }
  try {
    const failure = normalizeFailure(value, signal === undefined ? {} : { signal });
    return {
      outcome: failure.outcome === "provider-failure" ? "defect" : failure.outcome,
      ...(failure.kind === "application" ? { errorId: failure.id } : {}),
    };
  } catch {
    return { outcome: "defect" };
  }
}

/** Runs input mapping and records its duration and validation outcome.
 * @param map - Lazy input-mapping callback whose result is recorded.
 * @param builder - Optional request-record builder receiving stage details.
 * @param targetId - Stable target identifier used in traces and request records.
 * @returns The mapping callback result; rejections retain their original identity.
 */
export async function mapInputWithRecord(
  map: () => Promise<unknown>,
  builder: RequestRecordBuilder | undefined,
  targetId: string,
): Promise<unknown> {
  const startedAt = Date.now();
  publicTrace.event("http.mapping.started", { "code.function.name": targetId });
  try {
    const input = await map();
    const failure = isRequestMappingFailure(input);
    recordDetail(builder, {
      kind: "mapping",
      targetId,
      durationMs: Math.max(0, Date.now() - startedAt),
      outcome: failure ? "validation-error" : "success",
    });
    publicTrace.event("http.mapping.completed", { "code.function.name": targetId });
    return input;
  } catch (cause) {
    const failure = failureOutcome(cause);
    recordDetail(builder, {
      kind: "mapping",
      targetId,
      durationMs: Math.max(0, Date.now() - startedAt),
      outcome: failure.outcome,
    });
    builder?.setOutcome(failure.outcome, failure.errorId);
    publicTrace.event("http.mapping.failed", { "code.function.name": targetId });
    throw cause;
  }
}

/** Invokes the shared engine boundary and records the route or middleware outcome.
 * @param engine - engine supplied by the caller.
 * @param invocation - Native invocation options containing validated input and request context.
 * @param builder - Optional request-record builder receiving stage details.
 * @param kind - Declared stage or control kind selecting the relevant policy.
 * @param targetId - Stable target identifier used in traces and request records.
 * @returns The engine result; rejections retain their original identity after outcome recording.
 */
export async function invokeWithRecord(
  engine: HttpEngine,
  invocation: HttpInvocationOptions,
  builder: RequestRecordBuilder | undefined,
  kind: "middleware" | "function",
  targetId: string,
): Promise<unknown> {
  const startedAt = Date.now();
  try {
    const value = await invokeHttpEngine(engine, invocation);
    recordDetail(builder, {
      kind,
      targetId,
      durationMs: Math.max(0, Date.now() - startedAt),
      outcome: "success",
    });
    return value;
  } catch (cause) {
    const failure = failureOutcome(cause, invocation.signal);
    recordDetail(builder, {
      kind,
      targetId,
      durationMs: Math.max(0, Date.now() - startedAt),
      outcome: failure.outcome,
    });
    builder?.setOutcome(failure.outcome, failure.errorId);
    throw cause;
  }
}
