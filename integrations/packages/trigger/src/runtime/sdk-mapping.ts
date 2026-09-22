import { assertJsonValue } from "@relkit/contracts";
import type { NativeRun, OperationContext } from "@relkit/jobs/adapter";
import type { RunSnapshot } from "@relkit/contracts/jobs";

export function triggerSnapshot(
  value: unknown,
  context: OperationContext,
  fallbackRunId?: string,
): NativeRun {
  const run = record(value);
  if (run === undefined) throw new TypeError("Trigger SDK run is invalid");
  const payload = record(run.payload);
  const metadata = { ...(record(payload?.relkit) ?? {}), ...(record(run.metadata) ?? {}) };
  const status = statusOf(run.status);
  const output = run.output;
  const hasOutput = Object.hasOwn(run, "output");
  const validOutput = !hasOutput || isJsonValue(output);
  const runId = text(run.id ?? fallbackRunId, "Trigger run id");
  const base = {
    accepted: true as const,
    runId,
    jobId: textOptional(metadata?.relkitJobId) ?? "unknown",
    taskId: textOptional(metadata?.relkitTaskId) ?? textOptional(run.taskIdentifier) ?? "unknown",
    taskVersion:
      textOptional(metadata?.relkitTaskVersion) ?? textOptional(run.version) ?? "unknown",
    acceptedAt: instant(run.createdAt) ?? new Date().toISOString(),
    buildId: textOptional(metadata?.relkitBuildId) ?? "unknown",
    service: textOptional(metadata?.relkitService) ?? context.service,
    status,
    observedAt: new Date().toISOString(),
    resultAvailability:
      status === "completed"
        ? !hasOutput
          ? "void"
          : validOutput
            ? "available"
            : "unavailable"
        : "pending",
    ...(payload?.input === undefined ? {} : { input: payload.input }),
    ...(textOptional(metadata?.relkitScope) === undefined
      ? {}
      : { scope: textOptional(metadata?.relkitScope) }),
    ...(textOptional(metadata?.relkitAcceptanceIdentity) === undefined
      ? {}
      : { acceptanceIdentity: textOptional(metadata?.relkitAcceptanceIdentity) }),
    ...(textOptional(metadata?.relkitParentRunId) === undefined
      ? {}
      : { parentRunId: textOptional(metadata?.relkitParentRunId) }),
    ...(textOptional(metadata?.relkitScheduledFor) === undefined
      ? {}
      : { scheduledFor: textOptional(metadata?.relkitScheduledFor) }),
    ...(textOptional(metadata?.relkitRetryOfRunId) === undefined
      ? {}
      : { retryOfRunId: textOptional(metadata?.relkitRetryOfRunId) }),
    ...(textOptional(metadata?.relkitCorrelationId) === undefined
      ? {}
      : { correlationId: textOptional(metadata?.relkitCorrelationId) }),
    ...(Array.isArray(run.tags) ? { tags: run.tags } : {}),
    ...(number(run.attempt) === undefined ? {} : { attempt: number(run.attempt) }),
    ...(instant(run.startedAt) === undefined ? {} : { startedAt: instant(run.startedAt) }),
    ...(instant(run.finishedAt) === undefined ? {} : { completedAt: instant(run.finishedAt) }),
    ...(status === "failed" && record(run.error) !== undefined
      ? {
          error: {
            code: "TRIGGER_RUN_FAILED",
            message: text(record(run.error)?.message, "Trigger error message"),
          },
        }
      : {}),
  };
  return (
    status === "completed" && hasOutput && validOutput
      ? { ...base, resultAvailability: "available", output }
      : base
  ) as RunSnapshot;
}

export function statusOf(value: unknown): RunSnapshot["status"] {
  const status = typeof value === "string" ? value.toUpperCase() : value;
  switch (status) {
    case "COMPLETED":
      return "completed";
    case "CANCELED":
      return "cancelled";
    case "FAILED":
    case "CRASHED":
    case "SYSTEM_FAILURE":
      return "failed";
    case "TIMED_OUT":
    case "EXPIRED":
      return "timed-out";
    case "DELAYED":
      return "delayed";
    case "WAITING":
      return "sleeping";
    case "EXECUTING":
      return "running";
    case "QUEUED":
    case "DEQUEUED":
    case "PENDING_VERSION":
      return "queued";
    default:
      return "unknown";
  }
}

export function isJsonValue(value: unknown): boolean {
  try {
    assertJsonValue(value);
    return true;
  } catch {
    return false;
  }
}

export function record(value: unknown): Record<string, any> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : undefined;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value === "") throw new TypeError(label + " is invalid");
  return value;
}

function textOptional(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function instant(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  return textOptional(value);
}
