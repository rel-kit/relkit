import { Cause } from "effect";
import { isJsonValue } from "@zsys/contracts";
import {
  isCancellation,
  isDeclaredError,
  isProviderError,
  isTimeout,
  requiredText,
} from "./failure-guards.js";
import { makeFailure, RuntimeFailure } from "./failure-runtime.js";
import type {
  ApplicationFailure,
  ApplicationFailureOptions,
  CancellationFailure,
  InvocationFailure,
  NormalizeFailureOptions,
  ProviderFailure,
  ProviderFailureOptions,
  PublicFailureEnvelope,
  TimeoutFailure,
  UnexpectedDefect,
} from "./failure-types.js";

export type {
  ApplicationFailure,
  ApplicationFailureOptions,
  CancellationFailure,
  ErrorRetry,
  FailureBase,
  FailureKind,
  FailureOutcome,
  FailureTag,
  FailureTelemetry,
  FailureTelemetryOptions,
  InvocationFailure,
  NormalizeFailureOptions,
  ProviderFailure,
  ProviderFailureOptions,
  PublicFailureEnvelope,
  RedactedFailureDetail,
  TimeoutFailure,
  UnexpectedDefect,
} from "./failure-types.js";

export function applicationFailure(options: ApplicationFailureOptions): ApplicationFailure {
  return makeFailure(
    {
      _tag: "ApplicationFailure",
      kind: "application",
      outcome: "declared-error",
      code: requiredText(options.id, "application failure id"),
      message: requiredText(options.message, "application failure message"),
      id: options.id,
      data: options.data,
      retry: options.retry ?? "never",
      ...(options.status === undefined ? {} : { status: options.status }),
    },
    options.cause,
  ) as ApplicationFailure;
}

export function providerFailure(
  cause: unknown,
  options: Omit<ProviderFailureOptions, "cause"> = {},
): ProviderFailure {
  return makeFailure(
    {
      _tag: "ProviderFailure",
      kind: "provider",
      outcome: "provider-failure",
      code: "ZSYS_PROVIDER_FAILURE",
      message: "Provider operation failed",
      ...options,
    },
    cause,
  ) as ProviderFailure;
}

export const cancellationFailure = (cause?: unknown): CancellationFailure =>
  makeFailure(
    {
      _tag: "Cancellation",
      kind: "cancellation",
      outcome: "cancelled",
      code: "ZSYS_CANCELLED",
      message: "Operation cancelled",
    },
    cause,
  ) as CancellationFailure;
export const timeoutFailure = (cause?: unknown): TimeoutFailure =>
  makeFailure(
    {
      _tag: "Timeout",
      kind: "timeout",
      outcome: "timeout",
      code: "ZSYS_TIMEOUT",
      message: "Operation timed out",
    },
    cause,
  ) as TimeoutFailure;
export const unexpectedDefect = (cause?: unknown): UnexpectedDefect =>
  makeFailure(
    {
      _tag: "UnexpectedDefect",
      kind: "defect",
      outcome: "defect",
      code: "ZSYS_UNEXPECTED_DEFECT",
      message: "Unexpected internal error",
    },
    cause,
  ) as UnexpectedDefect;
export const defectFailure = unexpectedDefect;

export function normalizeFailure(
  value: unknown,
  options: NormalizeFailureOptions = {},
): InvocationFailure {
  if (isInvocationFailure(value)) return value;
  if (Cause.isCause(value)) {
    if (options.timedOut) return timeoutFailure(value);
    if (Cause.hasInterruptsOnly(value) || options.signal?.aborted)
      return cancellationFailure(value);
    const reason = value.reasons.find((entry) => !Cause.isInterruptReason(entry));
    if (reason === undefined) return cancellationFailure(value);
    const inner = Cause.isFailReason(reason)
      ? reason.error
      : Cause.isDieReason(reason)
        ? reason.defect
        : reason;
    return normalizeValue(inner, value, options);
  }
  return normalizeValue(value, value, options);
}

function normalizeValue(
  value: unknown,
  detail: unknown,
  options: NormalizeFailureOptions,
): InvocationFailure {
  if (options.timedOut || isTimeout(value)) return timeoutFailure(detail);
  if (options.signal?.aborted || isCancellation(value)) return cancellationFailure(detail);
  if (isDeclaredError(value)) {
    return applicationFailure({
      id: value.id,
      data: value.data,
      message: value.message,
      retry: value.retry,
      ...(value.http === undefined ? {} : { status: value.http.status }),
      cause: detail,
    });
  }
  if (options.source === "provider" || isProviderError(value))
    return providerFailure(detail, options.provider);
  return unexpectedDefect(detail);
}

export function isInvocationFailure(value: unknown): value is InvocationFailure {
  return value instanceof RuntimeFailure;
}

export function toPublicEnvelope(value: unknown): PublicFailureEnvelope {
  const failure = normalizeFailure(value);
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
  };
}
