import type { JobErrorEnvelope, RunSnapshot } from "@relkit/contracts/jobs";
import type { NativeRun, OperationContext } from "@relkit/jobs/adapter";
import { Exit, Option } from "effect";
import type { JobStore } from "effect-mq";
import type { EffectMqPostgresState } from "./postgres-state.js";

export async function effectMqSnapshot(
  state: EffectMqPostgresState,
  record: JobStore.JobRecord,
  context: OperationContext,
): Promise<NativeRun> {
  const metadata = record.metadata;
  const status = statusOf(record);
  const base = {
    accepted: true as const,
    runId: String(record.id),
    jobId: metadataText(metadata, "relkitJobId", record.name),
    taskId: metadataText(metadata, "relkitTaskId", record.name),
    taskVersion: metadataText(metadata, "relkitTaskVersion", "unknown"),
    acceptedAt: date(record.enqueuedAt),
    buildId: metadataText(metadata, "relkitBuildId", "unknown"),
    service: metadataText(metadata, "relkitService", context.service),
    status,
    observedAt: new Date().toISOString(),
    resultAvailability: status === "completed" ? ("void" as const) : ("pending" as const),
    ...(metadataOptional(metadata, "relkitScope") === undefined
      ? {}
      : { scope: metadataOptional(metadata, "relkitScope") }),
    ...(metadata.relkitInputHash === undefined ? {} : { inputHash: metadata.relkitInputHash }),
    ...(metadata.relkitInputSchemaHash === undefined
      ? {}
      : { inputSchemaHash: metadata.relkitInputSchemaHash }),
    ...(metadata.relkitAcceptanceIdentity === undefined
      ? {}
      : { acceptanceIdentity: metadata.relkitAcceptanceIdentity }),
    ...(metadataOptional(metadata, "relkitScheduledFor") === undefined
      ? {}
      : { scheduledFor: metadataOptional(metadata, "relkitScheduledFor") }),
    ...(metadata.relkitParentRunId === undefined
      ? {}
      : { parentRunId: metadata.relkitParentRunId }),
    ...(metadata.relkitRetryOfRunId === undefined
      ? {}
      : { retryOfRunId: metadata.relkitRetryOfRunId }),
    ...(record.processedAt === undefined ? {} : { startedAt: date(record.processedAt) }),
    ...(record.finishedAt === undefined ? {} : { completedAt: date(record.finishedAt) }),
    ...(record.runAt > Date.now() ? { nextEligibleAt: date(record.runAt) } : {}),
    ...(record.attemptsMade === 0 ? {} : { attempt: record.attemptsMade }),
    ...(status === "failed" ? { error: failure(record.failedReason) } : {}),
  };
  const payload = object(record.payload);
  const payloadInput = object(payload?.input);
  const input =
    payloadInput !== undefined && Object.hasOwn(payloadInput, "input")
      ? payloadInput.input
      : payload?.input;
  const job = state.jobs.get(record.name) ?? state.ensureJob(record.name);
  const polled = (await state
    .run(job.poll(record.id) as never, context.signal)
    .catch(() => Option.none())) as Option.Option<{
    readonly exit: Option.Option<Exit.Exit<unknown, unknown>>;
  }>;
  const exit = Option.isSome(polled) ? polled.value.exit : Option.none();
  const tags = parseTags(metadata.relkitTags);
  const extra = {
    ...(input === undefined ? {} : { input }),
    ...(metadata.relkitCorrelationId === undefined
      ? {}
      : { correlationId: metadata.relkitCorrelationId }),
    ...(tags.length === 0 ? {} : { tags }),
  };
  if (status !== "completed") return { ...base, ...extra } as NativeRun;
  if (Option.isSome(exit) && Exit.isSuccess(exit.value) && exit.value.value !== undefined) {
    return {
      ...base,
      ...extra,
      resultAvailability: "available",
      output: exit.value.value,
    } as RunSnapshot;
  }
  return { ...base, ...extra } as NativeRun;
}

export function statusOf(record: JobStore.JobRecord): NativeRun["status"] {
  if (record.state === "completed") return "completed";
  if (record.state === "failed") return "failed";
  if (record.state === "cancelled") return "cancelled";
  if (record.state === "delayed") return record.attemptsMade > 0 ? "retrying" : "delayed";
  if (record.state === "active") return "running";
  if (record.state === "waiting-children") return "sleeping";
  return record.attemptsMade > 0 ? "retrying" : "queued";
}

function failure(reason: string | undefined): JobErrorEnvelope {
  return { code: "EFFECT_MQ_JOB_FAILED", message: reason ?? "Effect MQ job failed" };
}

function object(value: unknown): Record<string, any> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : undefined;
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value !== "" ? value : fallback;
}

function metadataText(
  metadata: Readonly<Record<string, string>>,
  name: string,
  fallback: string,
): string {
  return text(metadataValue(metadata, name), fallback);
}

function metadataOptional(
  metadata: Readonly<Record<string, string>>,
  name: string,
): string | undefined {
  const value = metadataValue(metadata, name);
  return typeof value === "string" && value !== "" ? value : undefined;
}

function metadataValue(
  metadata: Readonly<Record<string, string>>,
  name: string,
): string | undefined {
  const plain = name.startsWith("relkit")
    ? name.slice(6).replace(/^[A-Z]/u, (value) => value.toLowerCase())
    : name;
  return metadata[name] ?? metadata[plain];
}

function date(value: number): string {
  return new Date(value).toISOString();
}

function parseTags(value: string | undefined): readonly string[] {
  if (value === undefined) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}
