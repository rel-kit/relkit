import { Effect, Stream } from "effect";
import { observeCli } from "../cli-runtime.js";
import { CliJobsSdk } from "../services/jobs-sdk.service.js";
import { cliAdapterError, cliOriginalError, cliTry } from "../cli-errors.js";
import { jobsIdentityHeadersEffect, fetchJobsJsonEffect } from "./jobs-http.js";
import { readJobsJsonFileEffect, readJobsManifestEffect } from "./jobs-json.js";
import { requireOption, usage } from "./jobs-support.js";
import { JobsCommandError } from "./jobs-error.js";
import { findJobName, jobsRecord, jobsText, triggerError } from "./jobs-rpc-support.js";
import type { JobsManifestView, JobsWatchContext, ParsedJobs } from "./jobs.types.js";

/**
 * Resolves one public job name and submits one native mutation without retry.
 * @param baseUrl - Validated loopback backend URL.
 * @param parsed - Existing normalized arguments.
 * @param signal - Caller cancellation combined by the SDK owner.
 * @returns Original native result; ambiguity retains recovery operation/key identifiers.
 */
export const triggerJobEffect = Effect.fn("Jobs.trigger")(
  function* (baseUrl: string, parsed: ParsedJobs, signal: AbortSignal) {
    yield* cliTry("jobs.trigger-options", () => requireOption(parsed, "job"));
    const inputFile = parsed.options["input-file"];
    if (inputFile === undefined)
      return yield* Effect.fail(
        cliAdapterError("jobs.trigger-options", usage("jobs trigger requires --input-file.")),
      );
    const input = yield* readJobsJsonFileEffect(parsed.projectRoot, inputFile);
    const operationId = parsed.options["operation-id"] ?? globalThis.crypto.randomUUID();
    const idempotencyKey = parsed.options["idempotency-key"];
    const options = {
      operationId,
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      ...(parsed.options.delay === undefined ? {} : { delay: parsed.options.delay }),
      ...(parsed.options.at === undefined ? {} : { at: parsed.options.at }),
    };
    const manifest = yield* readJobsManifestEffect(parsed.projectRoot);
    const job = yield* resolveJobNameEffect(baseUrl, parsed, parsed.options.job!, manifest);
    const headers = yield* rpcHeaders(baseUrl, manifest);
    const sdk = yield* CliJobsSdk;
    return yield* sdk
      .trigger(baseUrl, headers, job, { input, options }, signal)
      .pipe(
        Effect.mapError((error) =>
          cliAdapterError(
            "jobs.trigger",
            triggerError(cliOriginalError(error), operationId, idempotencyKey),
          ),
        ),
      );
  },
  (effect) => observeCli("jobs.trigger.workflow", effect),
);

/**
 * Streams original watch frames in order under a single SDK iterator owner.
 * @param baseUrl - Validated loopback backend URL.
 * @param parsed - Existing locator and resume cursor.
 * @param context - Original reporter and caller cancellation.
 * @returns After completion or interruption and physical iterator return.
 * @remarks The stream wrapper exposes only next; the SDK scope owns return once.
 */
export const watchJobEffect = Effect.fn("Jobs.watch")(
  function* (baseUrl: string, parsed: ParsedJobs, context: JobsWatchContext) {
    yield* cliTry("jobs.watch-options", () => requireOption(parsed, "run-id"));
    const runId = parsed.options["run-id"]!;
    const manifest = yield* readJobsManifestEffect(parsed.projectRoot);
    const response = yield* fetchJobsJsonEffect(
      baseUrl,
      parsed,
      "GET",
      `/jobs/runs/${encodeURIComponent(runId)}`,
    );
    const run = jobsRecord(jobsRecord(response)?.run) ?? jobsRecord(response);
    const jobId = jobsText(run?.jobId);
    if (jobId === undefined)
      return yield* Effect.fail(
        cliAdapterError(
          "jobs.watch-run",
          new JobsCommandError(
            "RELKIT_JOBS_REQUEST_FAILED",
            "Run response did not include a job ID.",
          ),
        ),
      );
    const job = yield* resolveJobNameEffect(baseUrl, parsed, jobId, manifest, `run ${runId}`);
    const headers = yield* rpcHeaders(baseUrl, manifest);
    const sdk = yield* CliJobsSdk;
    const iterator = yield* sdk.watch(
      baseUrl,
      headers,
      job,
      {
        runId,
        ...(parsed.options.after === undefined ? {} : { after: parsed.options.after }),
      },
      context.signal,
    );
    yield* Stream.fromAsyncIterable(
      { [Symbol.asyncIterator]: () => ({ next: () => iterator.next() }) },
      (cause) => cliAdapterError("jobs.watch-read", cause),
    ).pipe(Stream.runForEach((value) => Effect.sync(() => context.reporter.output(value))));
  },
  (effect) => observeCli("jobs.watch.workflow", effect),
);

/**
 * Resolves an existing durable identifier through local definitions, then the server.
 * @param baseUrl - Validated loopback backend URL.
 * @param parsed - Existing query filters.
 * @param requested - Existing requested job identifier.
 * @param manifest - Optional accepted local projection.
 * @param subject - Existing diagnostic subject.
 * @returns Public procedure name or unchanged request failure.
 */
const resolveJobNameEffect = Effect.fn("Jobs.resolve-name")(
  function* (
    baseUrl: string,
    parsed: ParsedJobs,
    requested: string,
    manifest: JobsManifestView | undefined,
    subject = `job ${requested}`,
  ) {
    const fromManifest = findJobName(manifest?.jobs, requested);
    if (fromManifest !== undefined) return fromManifest;
    const definitions = yield* fetchJobsJsonEffect(baseUrl, parsed, "GET", "/jobs/definitions");
    const fromServer = findJobName(jobsRecord(definitions)?.items, requested);
    if (fromServer === undefined)
      return yield* Effect.fail(
        cliAdapterError(
          "jobs.resolve-name",
          new JobsCommandError(
            "RELKIT_JOBS_REQUEST_FAILED",
            `No job definition was found for ${subject}.`,
          ),
        ),
      );
    return fromServer;
  },
  (effect) => observeCli("jobs.resolve-name.workflow", effect),
);

/**
 * Preserves issued identity/cookies and the optional compiled protocol version.
 * @param baseUrl - Validated loopback server URL.
 * @param manifest - Optional accepted compiled manifest.
 * @returns Original authentication plus protocol headers.
 */
const rpcHeaders = Effect.fn("Jobs.rpc-headers")(
  function* (baseUrl: string, manifest: JobsManifestView | undefined) {
    return {
      ...(yield* jobsIdentityHeadersEffect(baseUrl)),
      "x-relkit-jobs-protocol": String(manifest?.jobsProtocolVersion ?? 1),
    };
  },
  (effect) => observeCli("jobs.rpc-headers.workflow", effect),
);
