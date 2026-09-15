import { createHash } from "node:crypto";
import type { JsonValue } from "@relkit/contracts";
import type { TracePropagation } from "@relkit/contracts";
import type { RunHandle, RunSnapshot } from "@relkit/contracts/jobs";

export const MAX_LOCAL_INDEX_ENTRIES = 1_000;

export interface InngestRunMetadata extends RunHandle {
  readonly eventId: string;
  readonly input?: JsonValue;
  readonly inputHash?: string;
  readonly inputSchemaHash?: string;
  readonly buildId: string;
  readonly service: string;
  readonly scope?: string;
  readonly acceptanceIdentity?: string;
  readonly occurrenceIdentity?: string;
  readonly parentRunId?: string;
  readonly scheduledFor?: string;
  readonly retryOfRunId?: string;
  readonly tags?: readonly string[];
  readonly correlationId?: string;
  readonly propagation?: TracePropagation;
  readonly serviceGeneration?: string;
}

export class InngestApiRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "InngestApiRequestError";
  }
}

export interface InngestRunApi {
  readonly eventRuns: (eventId: string, signal?: AbortSignal) => Promise<readonly Record<string, unknown>[]>;
  readonly run: (runId: string, signal?: AbortSignal) => Promise<Record<string, unknown>>;
  readonly cancel: (runId: string, reason: string | undefined, signal?: AbortSignal) => Promise<Record<string, unknown>>;
  readonly retry: (runId: string, signal?: AbortSignal) => Promise<Record<string, unknown>>;
}

export function createInngestRunApi(options: {
  readonly baseUrl: string;
  readonly signingKey?: string;
  readonly fetch?: typeof globalThis.fetch;
}): InngestRunApi {
  const fetcher = options.fetch ?? globalThis.fetch;
  const request = async (
    path: string,
    init: RequestInit = {},
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> => {
    const response = await fetcher(`${options.baseUrl.replace(/\/$/u, "")}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(options.signingKey === undefined ? {} : { authorization: `Bearer ${hashSigningKey(options.signingKey)}` }),
        ...(init.headers ?? {}),
      },
      ...(signal === undefined ? {} : { signal }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new InngestApiRequestError(response.status, `Inngest native API request failed (${response.status}).`);
    if (body === null || typeof body !== "object" || Array.isArray(body)) return {};
    return body as Record<string, unknown>;
  };
  return Object.freeze({
    eventRuns: async (eventId: string, signal?: AbortSignal) => {
      const body = await request(`/v2/events/${encodeURIComponent(eventId)}/runs?limit=40`, {}, signal);
      return rows(body.data);
    },
    run: async (runId: string, signal?: AbortSignal) => {
      const body = await request(`/v1/runs/${encodeURIComponent(runId)}`, {}, signal);
      return record(body.data) ?? body;
    },
    cancel: async (runId: string, reason: string | undefined, signal?: AbortSignal) => request(`/v1/runs/${encodeURIComponent(runId)}/cancel`, {
      method: "POST",
      body: JSON.stringify(reason === undefined ? {} : { reason }),
    }, signal),
    retry: async (runId: string, signal?: AbortSignal) => request(`/v1/runs/${encodeURIComponent(runId)}/retry`, { method: "POST" }, signal),
  });
}

export function snapshot(
  value: Record<string, unknown>,
  metadata: InngestRunMetadata,
  observedAt = new Date().toISOString(),
): RunSnapshot {
  const status = statusOf(value.status);
  const output = Object.hasOwn(value, "output") ? value.output : value.result;
  const base = {
    accepted: true as const,
    runId: text(value.run_id ?? value.runId ?? metadata.runId, metadata.runId),
    jobId: metadata.jobId,
    taskId: metadata.taskId,
    taskVersion: metadata.taskVersion,
    acceptedAt: metadata.acceptedAt,
    buildId: metadata.buildId,
    service: metadata.service,
    status,
    observedAt,
    resultAvailability: status === "completed" ? (output === undefined ? "void" : "available") : "pending",
    ...(metadata.input === undefined ? {} : { input: metadata.input }),
    ...(metadata.inputHash === undefined ? {} : { inputHash: metadata.inputHash }),
    ...(metadata.inputSchemaHash === undefined ? {} : { inputSchemaHash: metadata.inputSchemaHash }),
    ...(metadata.scope === undefined ? {} : { scope: metadata.scope }),
    ...(metadata.acceptanceIdentity === undefined ? {} : { acceptanceIdentity: metadata.acceptanceIdentity }),
    ...(metadata.parentRunId === undefined ? {} : { parentRunId: metadata.parentRunId }),
    ...(metadata.scheduledFor === undefined ? {} : { scheduledFor: metadata.scheduledFor }),
    ...(metadata.retryOfRunId === undefined ? {} : { retryOfRunId: metadata.retryOfRunId }),
    ...(number(value.attempt) === undefined ? {} : { attempt: number(value.attempt) }),
    ...(date(value.started_at ?? value.startedAt) === undefined ? {} : { startedAt: date(value.started_at ?? value.startedAt) }),
    ...(date(value.completed_at ?? value.completedAt) === undefined ? {} : { completedAt: date(value.completed_at ?? value.completedAt) }),
    ...(value.error === undefined ? {} : { error: { code: "INNGEST_RUN_FAILED", message: text(value.error, "native error") } }),
  };
  return (status === "completed" && output !== undefined
    ? { ...base, status: "completed", resultAvailability: "available", output: output as unknown }
    : base) as RunSnapshot;
}

export function statusOf(value: unknown): RunSnapshot["status"] {
  const status = typeof value === "string" ? value.toLowerCase().replaceAll(" ", "-") : "unknown";
  if (status.includes("complete")) return "completed";
  if (status.includes("cancel")) return "cancelled";
  if (status.includes("fail")) return "failed";
  if (status.includes("sleep")) return "sleeping";
  if (status.includes("retry")) return "retrying";
  if (status.includes("delay")) return "delayed";
  if (status.includes("timeout")) return "timed-out";
  if (status.includes("run")) return "running";
  if (status.includes("queue") || status.includes("pending")) return "queued";
  return "unknown";
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(record) : [];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value !== "" ? value : fallback;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}

function date(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function hashSigningKey(signingKey: string): string {
  const prefix = signingKey.match(/^signkey-[\w]+-/u)?.[0] ?? "";
  const key = signingKey.slice(prefix.length).replace(/[^a-z0-9]/giu, "");
  const normalized = key.length % 2 === 0 ? key : `0${key}`;
  return `${prefix}${createHash("sha256").update(Buffer.from(normalized, "hex")).digest("hex")}`;
}

export function isAmbiguousInngestWrite(error: unknown): boolean {
  return !(error instanceof InngestApiRequestError && error.status >= 400 && error.status < 500);
}

export function rememberInngestRecord(
  records: Map<string, InngestRunMetadata>,
  key: string,
  value: InngestRunMetadata,
): void {
  records.set(key, value);
  while (records.size > MAX_LOCAL_INDEX_ENTRIES) {
    const oldest = records.keys().next().value;
    if (typeof oldest !== "string") return;
    records.delete(oldest);
  }
}
