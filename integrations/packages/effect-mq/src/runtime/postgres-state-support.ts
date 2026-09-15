import { parseTracePropagation } from "@relkit/contracts";
import type { TaskExecutionBinding, TaskExecutionEnvelope } from "@relkit/jobs/adapter";
import { Worker } from "effect-mq";
import type { EffectMqTaskDefinition } from "./worker.js";

export function envelopeFrom(
  input: unknown,
  definition: EffectMqTaskDefinition,
  context: Worker.JobContext,
): TaskExecutionEnvelope {
  const value = record(input);
  const metadata = record(value?.metadata);
  const wire = value?.input ?? input;
  const textValue = (name: string, fallback: string): string => text(metadataValue(metadata, name), fallback);
  const attempt = number(metadataValue(metadata, "relkitAttempt")) ?? context.attempt;
  const scheduledFor = textOptional(metadataValue(metadata, "relkitScheduledFor")) ?? scheduledInstant(context.jobId);
  const occurrenceIdentity = textOptional(metadataValue(metadata, "relkitOccurrenceIdentity")) ??
    (scheduledFor === undefined ? undefined : String(context.jobId));
  const propagation = parseStoredPropagation(metadataValue(metadata, "relkitPropagation"));
  return {
    runId: textValue("relkitRunId", String(context.jobId)),
    jobId: textValue("relkitJobId", definition.jobId),
    taskId: textValue("relkitTaskId", definition.taskId),
    taskVersion: textValue("relkitTaskVersion", definition.version),
    buildId: textValue("relkitBuildId", definition.buildId),
    input: wire as TaskExecutionEnvelope["input"],
    attempt,
    ...optional(metadata, "inputHash", "relkitInputHash"),
    ...optional(metadata, "inputSchemaHash", "relkitInputSchemaHash"),
    ...optional(metadata, "acceptedAt", "relkitAcceptedAt"),
    ...(scheduledFor === undefined ? {} : { scheduledFor }),
    ...optional(metadata, "parentRunId", "relkitParentRunId"),
    ...optional(metadata, "service", "relkitService"),
    ...optional(metadata, "serviceGeneration", "relkitServiceGeneration"),
    ...optional(metadata, "scope", "relkitScope"),
    ...optional(metadata, "acceptanceIdentity", "relkitAcceptanceIdentity"),
    ...(occurrenceIdentity === undefined ? {} : { occurrenceIdentity }),
    ...(propagation === undefined ? {} : { propagation }),
  };
}

export function bindingFrom(envelope: TaskExecutionEnvelope, signal: AbortSignal): TaskExecutionBinding {
  return {
    run: {
      runId: envelope.runId,
      jobId: envelope.jobId,
      taskId: envelope.taskId,
      taskVersion: envelope.taskVersion,
      buildId: envelope.buildId,
      ...(envelope.attempt === undefined ? {} : { attempt: envelope.attempt }),
      ...(envelope.acceptedAt === undefined ? {} : { acceptedAt: envelope.acceptedAt }),
      ...(envelope.scheduledFor === undefined ? {} : { scheduledFor: envelope.scheduledFor }),
      ...(envelope.parentRunId === undefined ? {} : { parentRunId: envelope.parentRunId }),
      ...(envelope.service === undefined ? {} : { service: envelope.service }),
      ...(envelope.serviceGeneration === undefined ? {} : { serviceGeneration: envelope.serviceGeneration }),
      ...(envelope.scope === undefined ? {} : { scope: envelope.scope }),
      ...(envelope.inputSchemaHash === undefined ? {} : { inputSchemaHash: envelope.inputSchemaHash }),
      ...(envelope.acceptanceIdentity === undefined ? {} : { acceptanceIdentity: envelope.acceptanceIdentity }),
      ...(envelope.occurrenceIdentity === undefined ? {} : { occurrenceIdentity: envelope.occurrenceIdentity }),
      ...(envelope.propagation === undefined ? {} : { propagation: envelope.propagation }),
    },
    signal,
  };
}

export function attempts(policy: unknown): number | undefined {
  const retry = record(record(policy)?.retry);
  return typeof retry?.maxAttempts === "number" && Number.isSafeInteger(retry.maxAttempts) && retry.maxAttempts > 0
    ? retry.maxAttempts
    : undefined;
}

function optional(metadata: Record<string, unknown> | undefined, name: string, storedName = name): Record<string, string> {
  const value = metadataValue(metadata, storedName);
  return typeof value === "string" ? { [name]: value } : {};
}

function metadataValue(metadata: Record<string, unknown> | undefined, name: string): unknown {
  if (metadata === undefined) return undefined;
  const plain = name.startsWith("relkit") ? name.slice(6).replace(/^[A-Z]/u, (value) => value.toLowerCase()) : name;
  return metadata[name] ?? metadata[plain];
}

function parseStoredPropagation(value: unknown): ReturnType<typeof parseTracePropagation> {
  if (typeof value !== "string") return parseTracePropagation(value);
  try { return parseTracePropagation(JSON.parse(value)); } catch { return undefined; }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value !== "" ? value : fallback;
}

function textOptional(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function scheduledInstant(jobId: unknown): string | undefined {
  const value = String(jobId);
  if (!value.startsWith("sched/")) return undefined;
  const slot = Number(value.slice(value.lastIndexOf("/") + 1));
  return Number.isSafeInteger(slot) && slot > 0 ? new Date(slot).toISOString() : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
