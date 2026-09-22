import { ORPCError, createClient } from "@relkit/client";
import type { CliCommandContext } from "../main-support.js";
import { JobsCommandError, requireOption, type ParsedJobs, usage } from "./jobs-support.js";
import { fetchJobsJson, jobsBaseUrl, readJobsJsonFile } from "./jobs-request.js";
import { readJobsManifest, type JobsManifestView } from "./jobs-manifest.js";

type RpcProcedure = (
  input: unknown,
  options?: { readonly signal?: AbortSignal },
) => unknown | Promise<unknown>;
interface JobsRpcClient {
  readonly jobs: Readonly<
    Record<
      string,
      { readonly trigger: RpcProcedure; readonly runs: { readonly watch: RpcProcedure } }
    >
  >;
}

export async function triggerJob(parsed: ParsedJobs, signal: AbortSignal): Promise<unknown> {
  requireOption(parsed, "job");
  const inputFile = parsed.options["input-file"];
  if (inputFile === undefined) throw usage("jobs trigger requires --input-file.");
  const input = await readJobsJsonFile(parsed.projectRoot, inputFile);
  const operationId = parsed.options["operation-id"] ?? globalThis.crypto.randomUUID();
  const idempotencyKey = parsed.options["idempotency-key"];
  const options = {
    operationId,
    ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    ...(parsed.options.delay === undefined ? {} : { delay: parsed.options.delay }),
    ...(parsed.options.at === undefined ? {} : { at: parsed.options.at }),
  };
  const manifest = await readJobsManifest(parsed.projectRoot);
  const job = await resolveJobName(parsed, parsed.options.job!, manifest, signal);
  const client = await createJobsRpcClient(parsed, manifest);
  try {
    return await client.jobs[job]!.trigger({ input, options }, { signal });
  } catch (error) {
    throw triggerError(error, operationId, idempotencyKey);
  }
}

export async function watchJob(
  parsed: ParsedJobs,
  context: Pick<CliCommandContext, "reporter" | "signal">,
): Promise<void> {
  requireOption(parsed, "run-id");
  const runId = parsed.options["run-id"]!;
  const manifest = await readJobsManifest(parsed.projectRoot);
  const job = await resolveWatchJob(parsed, runId, manifest, context.signal);
  const client = await createJobsRpcClient(parsed, manifest);
  const value = await client.jobs[job]!.runs.watch(
    { runId, ...(parsed.options.after === undefined ? {} : { after: parsed.options.after }) },
    { signal: context.signal },
  );
  const iterator = toAsyncIterator(value);
  try {
    while (true) {
      const next = await iterator.next();
      if (next.done === true) break;
      context.reporter.output(next.value);
    }
  } finally {
    await iterator.return?.();
  }
}

async function resolveWatchJob(
  parsed: ParsedJobs,
  runId: string,
  manifest: JobsManifestView | undefined,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetchJobsJson(parsed, "GET", `/jobs/runs/${encodeURIComponent(runId)}`, {
    signal,
  });
  const run = record(record(response)?.run) ?? record(response);
  const jobId = text(run?.jobId);
  if (jobId === undefined)
    throw new JobsCommandError(
      "RELKIT_JOBS_REQUEST_FAILED",
      "Run response did not include a job ID.",
    );
  return resolveJobName(parsed, jobId, manifest, signal, `run ${runId}`);
}

async function resolveJobName(
  parsed: ParsedJobs,
  requested: string,
  manifest: JobsManifestView | undefined,
  signal: AbortSignal,
  subject = `job ${requested}`,
): Promise<string> {
  const fromManifest = findJobName(manifest?.jobs, requested);
  if (fromManifest !== undefined) return fromManifest;
  const definitions = await fetchJobsJson(parsed, "GET", "/jobs/definitions", { signal });
  const fromServer = findJobName(record(definitions)?.items, requested);
  if (fromServer === undefined)
    throw new JobsCommandError(
      "RELKIT_JOBS_REQUEST_FAILED",
      `No job definition was found for ${subject}.`,
    );
  return fromServer;
}

async function createJobsRpcClient(
  parsed: ParsedJobs,
  existingManifest?: JobsManifestView,
): Promise<JobsRpcClient> {
  const manifest = existingManifest ?? (await readJobsManifest(parsed.projectRoot));
  return createClient({
    baseUrl: jobsBaseUrl(),
    headers: {
      "x-relkit-jobs-protocol": String(manifest?.jobsProtocolVersion ?? 1),
      ...(manifest?.publicFingerprint === undefined
        ? {}
        : { "x-relkit-public-fingerprint": manifest.publicFingerprint }),
    },
  }) as unknown as JobsRpcClient;
}

function triggerError(
  error: unknown,
  operationId: string,
  idempotencyKey: string | undefined,
): JobsCommandError {
  if (error instanceof ORPCError && !isUnknown(error))
    return new JobsCommandError("RELKIT_JOBS_REQUEST_FAILED", `${error.code}: ${error.message}`);
  const unknown = unknownReceipt(error);
  const details = [
    `operationId=${unknown?.operationId ?? operationId}`,
    ...(unknown?.idempotencyKey === undefined
      ? idempotencyKey === undefined
        ? []
        : [`idempotencyKey=${idempotencyKey}`]
      : [`idempotencyKey=${unknown.idempotencyKey}`]),
  ];
  return new JobsCommandError(
    "RELKIT_JOB_SUBMISSION_UNKNOWN",
    `Job trigger outcome is unknown; ${details.join(", ")}. Retry with the same operation/key.`,
  );
}
function isUnknown(error: ORPCError<string, unknown>): boolean {
  return (
    error.code === "RELKIT_JOB_SUBMISSION_UNKNOWN" ||
    unknownReceipt(error) !== undefined ||
    [
      "BAD_GATEWAY",
      "CLIENT_CLOSED_REQUEST",
      "GATEWAY_TIMEOUT",
      "INTERNAL_SERVER_ERROR",
      "MALFORMED_ORPC_RESPONSE",
    ].includes(error.code)
  );
}
function unknownReceipt(
  error: unknown,
): { readonly operationId: string; readonly idempotencyKey?: string } | undefined {
  const candidate = error instanceof ORPCError ? record(error.data) : undefined;
  const operationId = text(candidate?.operationId);
  if (operationId === undefined) return undefined;
  const idempotencyKey = text(candidate?.idempotencyKey);
  if (idempotencyKey === undefined) return { operationId };
  return {
    operationId,
    idempotencyKey,
  };
}

function findJobName(values: unknown, jobId: string): string | undefined {
  if (!Array.isArray(values)) return undefined;
  const value = values.find((entry) => {
    const item = record(entry);
    return item !== undefined && (item.id === jobId || item.jobId === jobId || item.name === jobId);
  });
  return text(record(value)?.name);
}

function toAsyncIterator(value: unknown): AsyncIterator<unknown> {
  if (value !== null && (typeof value === "object" || typeof value === "function")) {
    const candidate = value as {
      readonly [Symbol.asyncIterator]?: () => AsyncIterator<unknown>;
      readonly next?: () => Promise<IteratorResult<unknown>>;
    };
    const asyncIterator = candidate[Symbol.asyncIterator];
    if (typeof asyncIterator === "function") return asyncIterator();
    if (typeof candidate.next === "function") return candidate as AsyncIterator<unknown>;
  }
  throw new TypeError("Job watch procedure did not return an async iterator.");
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
