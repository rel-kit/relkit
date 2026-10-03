import type { JsonValue } from "@relkit/contracts";
import type { NamedStreamFrame } from "@relkit/contracts/jobs";
import type { TaskJobNode } from "@relkit/graph";
import { TASK_ITEM_MAX_BYTES, validateCanonicalOutput } from "@relkit/jobs";
import { Context, Effect, Layer, Stream } from "effect";
import {
  httpBoundary,
  HttpBoundaryError,
  httpIterable,
  observeHttp,
  runHttp,
} from "../http-effect.js";
import type { RouteMaterializationOptions } from "../materialize-routes.js";
import type { RpcContext } from "../rpc.js";
import { assertGrantLive, authorizeJobOperation } from "./authorization.js";
import {
  configFor,
  envelopeInput,
  guardJobRequest,
  optionalCursor,
  requiredText,
} from "./common.js";
import { decodeJobCursor, encodeJobCursor } from "./cursors.js";
import { projectStreamFrame } from "./projection.js";
import { descriptorFor, jobError, runtimeFor, trustedScopeFor } from "./support.js";
import { jobPolicy } from "./types.js";

/** Authorizes and exposes a named job stream with validated projected frames.
 * @param options - Application dependencies and configuration for this domain.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param job - Registered job declaration and its client operation policy.
 * @param value - Value inspected, validated or projected by this operation.
 * @param signal - Cancellation signal inherited from the caller or owning scope.
 * @returns An Effect yielding an authorized iterable with validated frames and signed resume cursors.
 */
const streamJobRunEffect = Effect.fn("JobStreams.streamJobRun")(function* (
  options: RouteMaterializationOptions,
  context: RpcContext,
  job: TaskJobNode,
  value: unknown,
  signal?: AbortSignal,
) {
  const input = envelopeInput(value, ["runId", "name", "after", "expectedIdentity"]);
  yield* httpBoundary("jobs.streamJobRun", () =>
    guardJobRequest(options, context, input, "stream"),
  );
  const config = configFor(options);
  const descriptor = yield* httpBoundary("jobs.streamJobRun", () => descriptorFor(config, job));
  const runtime = yield* httpBoundary("jobs.streamJobRun", () => runtimeFor(config, job));
  const runId = requiredText(input.runId, "run ID");
  const name = requiredText(input.name, "stream name");
  const policy = jobPolicy(job);
  if (!policy.streams.includes(name))
    return yield* Effect.fail(
      new HttpBoundaryError({
        operation: "jobs.streamJobRun",
        cause: jobError("RELKIT_JOB_ACCESS_DENIED", "Job stream was not found."),
      }),
    );
  const trusted = yield* httpBoundary("jobs.streamJobRun", () =>
    trustedScopeFor(config, context, job, "stream"),
  );
  const authorized = yield* httpBoundary("jobs.streamJobRun", () =>
    authorizeJobOperation(
      config,
      context,
      job,
      descriptor,
      "stream",
      undefined,
      undefined,
      signal,
      runId,
      name,
    ),
  );
  const owner = { ...trusted, scope: authorized.grant.scope };
  const filters = { runId, name } as JsonValue;
  const after = decodeJobCursor(
    config,
    owner,
    job,
    "stream",
    filters,
    optionalCursor(input.after, "cursor"),
  );
  const source = nativeStream(runtime, runId, name, after, signal, owner.scope);
  return httpIterable(
    Stream.fromAsyncIterable(
      source,
      (cause) => new HttpBoundaryError({ operation: "jobs.stream.read", cause }),
    ).pipe(
      Stream.mapEffect(
        Effect.fn("JobStreams.projectFrame")(function* (frame) {
          assertGrantLive(authorized.grant);
          const streamSchema = descriptor.task.streams?.[name];
          if (frameIsChunk(frame) && streamSchema !== undefined) {
            yield* httpBoundary("jobs.stream.validate", () =>
              validateCanonicalOutput(streamSchema, frame.item, TASK_ITEM_MAX_BYTES),
            ).pipe(
              Effect.mapError(
                () =>
                  new HttpBoundaryError({
                    operation: "jobs.stream.validate",
                    cause: jobError(
                      "RELKIT_JOB_ACCESS_DENIED",
                      "Job stream data is not available.",
                    ),
                  }),
              ),
            );
          }
          const projected = projectStreamFrame(frame, runId, name);
          if (!("cursor" in projected) || projected.cursor === undefined) {
            return projected;
          }
          return {
            ...projected,
            cursor: encodeJobCursor(config, owner, job, "stream", filters, projected.cursor),
          };
        }),
      ),
    ),
  );
});

/** Runs stream job run through the request service, preserving the Promise API.
 * @param options - Application dependencies and configuration for this domain.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param job - Registered job declaration and its client operation policy.
 * @param value - Value inspected, validated or projected by this operation.
 * @param signal - Cancellation signal inherited from the caller or owning scope.
 * @returns An authorized named-stream iterable whose frames are projected as they are consumed.
 */
export function streamJobRun(
  options: RouteMaterializationOptions,
  context: RpcContext,
  job: TaskJobNode,
  value: unknown,
  signal?: AbortSignal,
): Promise<AsyncIterable<NamedStreamFrame<JsonValue>>> {
  return runHttp(
    Effect.gen(function* () {
      const service = yield* JobStreams;
      return yield* service.streamJobRun(options, context, job, value, signal);
    }).pipe(Effect.provide(JobStreamsLive)),
  );
}

/** Selects the provider's supported job stream method and validates its iterator contract.
 * @param runtime - Configured runtime and provider dependencies.
 * @param runId - Stable run identifier within the owning generation or provider scope.
 * @param name - Declared field, header, stream or configuration key.
 * @param after - Resume checkpoint after which observation continues.
 * @param signal - Cancellation signal inherited from the caller or owning scope.
 * @param scope - Authorized provider scope or lifetime scope owning the operation.
 * @returns The provider's observation iterable, rejecting unsupported or invalid stream adapters.
 */
function nativeStream(
  runtime: import("@relkit/jobs").JobsRuntime,
  runId: string,
  name: string,
  after: string | undefined,
  signal: AbortSignal | undefined,
  scope: string,
): AsyncIterable<unknown> {
  const streams = runtime.adapter.streams;
  if (streams === undefined)
    throw jobError("RELKIT_JOB_STREAM_UNSUPPORTED", "Job streams are unavailable.");
  const candidate = streams as Record<string, unknown>;
  const method = typeof candidate.observe === "function" ? candidate.observe : candidate.stream;
  if (typeof method !== "function")
    throw jobError("RELKIT_JOB_STREAM_UNSUPPORTED", "Job streams are unavailable.");
  const source = method(
    { runId, name, ...(after === undefined ? {} : { after }) },
    runtime.operationContext({ signal: signal ?? new AbortController().signal, scope }),
  );
  if (!isAsyncIterable(source))
    throw jobError("RELKIT_JOB_STREAM_UNSUPPORTED", "Job stream is invalid.");
  return source;
}

/** Recognizes stream chunk frames before validating their public items.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns Whether the inspected value satisfies the declared type guard.
 */
function frameIsChunk(value: unknown): value is { readonly item: unknown } {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as Record<string, unknown>).kind === "chunk"
  );
}

/** Recognizes a value that supplies the asynchronous iterator protocol.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns Whether the inspected value satisfies the declared type guard.
 */
function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function"
  );
}

/** Effect workflow for validated and authorized job requests. */
export class JobStreams extends Context.Service<
  JobStreams,
  {
    readonly streamJobRun: typeof streamJobRunEffect;
  }
>()("@relkit/runtime-hono/JobStreams") {}

/** Live job workflows; replace the service layer for focused transport tests. */
export const JobStreamsLive = Layer.succeed(JobStreams, {
  streamJobRun: (...args) => observeHttp("jobs.streamJobRun", streamJobRunEffect(...args)),
});
