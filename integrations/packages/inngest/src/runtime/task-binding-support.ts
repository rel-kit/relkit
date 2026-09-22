import { parseTracePropagation } from "@relkit/contracts";
import type { ScheduleDefinition } from "@relkit/jobs";
import type { TaskExecutionEnvelope } from "@relkit/jobs/adapter";
import type { Context } from "inngest";
import type { InngestTaskDefinition } from "./task-binding.js";

export function withoutSchedules(
  definition: InngestTaskDefinition,
): Omit<InngestTaskDefinition, "schedules" | "schedule"> {
  const { schedules: _schedules, schedule: _schedule, ...base } = definition;
  return base;
}

export function scheduleMetadata(
  context: Context,
  definition: InngestTaskDefinition,
): Record<string, unknown> {
  if (
    definition.jobId === undefined ||
    definition.taskId === undefined ||
    definition.buildId === undefined
  ) {
    throw new Error("RELKIT_INNGEST_SCHEDULE_DEFINITION_INVALID");
  }
  const event = record(context.event);
  const occurrenceIdentity = textOptional(event?.id);
  return {
    runId: context.runId,
    jobId: definition.jobId,
    taskId: definition.taskId,
    taskVersion: definition.taskVersion ?? definition.version,
    buildId: definition.buildId,
    ...(occurrenceIdentity === undefined ? {} : { occurrenceIdentity }),
  };
}

export function wireInput(input: unknown): TaskExecutionEnvelope["input"] {
  return { version: 1, kind: "json", value: input } as TaskExecutionEnvelope["input"];
}

export function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/gu, "-");
}

export function signalFrom(value: unknown): AbortSignal | undefined {
  const signal = record(value)?.signal;
  return signal instanceof AbortSignal ? signal : undefined;
}

export function envelopeFrom(
  context: Context,
  native: Record<string, unknown>,
  input: unknown,
): TaskExecutionEnvelope {
  const wire = input as TaskExecutionEnvelope["input"];
  const inputHash = textOptional(native.inputHash);
  const inputSchemaHash = textOptional(native.inputSchemaHash);
  const acceptedAt = textOptional(native.acceptedAt);
  const nativeAttempt = number(native.attempt);
  const attempt =
    nativeAttempt === undefined ? context.attempt + 1 : nativeAttempt > 0 ? nativeAttempt : 1;
  const parentRunId = textOptional(native.parentRunId);
  const service = textOptional(native.service);
  const serviceGeneration = textOptional(native.serviceGeneration);
  const scope = textOptional(native.scope);
  const acceptanceIdentity = textOptional(native.acceptanceIdentity);
  const occurrenceIdentity = textOptional(native.occurrenceIdentity);
  const propagation = parseTracePropagation(native.propagation);
  return {
    runId: text(native.runId ?? context.runId),
    jobId: text(native.jobId),
    taskId: text(native.taskId),
    taskVersion: text(native.taskVersion),
    buildId: text(native.buildId),
    input: wire,
    ...(inputHash === undefined ? {} : { inputHash }),
    ...(inputSchemaHash === undefined ? {} : { inputSchemaHash }),
    ...(acceptedAt === undefined ? {} : { acceptedAt }),
    attempt,
    ...(parentRunId === undefined ? {} : { parentRunId }),
    ...(service === undefined ? {} : { service }),
    ...(serviceGeneration === undefined ? {} : { serviceGeneration }),
    ...(scope === undefined ? {} : { scope }),
    ...(acceptanceIdentity === undefined ? {} : { acceptanceIdentity }),
    ...(occurrenceIdentity === undefined ? {} : { occurrenceIdentity }),
    ...(propagation === undefined ? {} : { propagation }),
  };
}

export function duration(milliseconds: number): `${number}s` {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 1)
    throw new TypeError("Inngest sleep duration is invalid");
  return `${Math.max(1, Math.ceil(milliseconds / 1_000))}s`;
}

export function record(value: unknown): Record<string, any> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : undefined;
}

function text(value: unknown): string {
  if (typeof value !== "string" || value === "")
    throw new TypeError("Inngest task metadata is invalid");
  return value;
}

function textOptional(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
