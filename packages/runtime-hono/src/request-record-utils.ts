import { InvocationValidationError } from "@relkit/engine";
import { normalizeFailure } from "@relkit/runtime-effect";
import { isRequestMappingFailure } from "./request-mapping.js";
import type { HttpEngine, HttpInvocationOptions } from "./materialize-routes.js";
import type { RequestOutcome } from "@relkit/observability";
import type { RequestRecordBuilder } from "@relkit/observability";
import { publicTrace } from "@relkit/invocation";

export function recordDetail(
  builder: RequestRecordBuilder | undefined,
  detail: Parameters<RequestRecordBuilder["add"]>[0],
): void {
  builder?.add(detail);
}

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

export async function invokeWithRecord(
  engine: HttpEngine,
  invocation: HttpInvocationOptions,
  builder: RequestRecordBuilder | undefined,
  kind: "middleware" | "function",
  targetId: string,
): Promise<unknown> {
  const startedAt = Date.now();
  try {
    const value = await engine.invoke(invocation);
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
