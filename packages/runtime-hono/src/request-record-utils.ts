import { InvocationValidationError } from "@zsys/engine";
import { normalizeFailure } from "@zsys/runtime-effect";
import { isRequestMappingFailure } from "./request-mapping.js";
import type { HttpEngine, HttpInvocationOptions } from "./materialize-routes.js";
import type { RequestOutcome } from "@zsys/observability";
import type { RequestRecordBuilder } from "@zsys/observability";

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
  try {
    const input = await map();
    const failure = isRequestMappingFailure(input);
    recordDetail(builder, {
      kind: "mapping",
      targetId,
      durationMs: Math.max(0, Date.now() - startedAt),
      outcome: failure ? "validation-error" : "success",
    });
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
