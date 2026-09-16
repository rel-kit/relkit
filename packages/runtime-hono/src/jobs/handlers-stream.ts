import type { JsonValue } from "@relkit/contracts";
import type { NamedStreamFrame } from "@relkit/contracts/jobs";
import { TASK_ITEM_MAX_BYTES, validateCanonicalOutput } from "@relkit/jobs";
import type { TaskJobNode } from "@relkit/graph";
import type { RouteMaterializationOptions } from "../materialize-routes.js";
import type { RpcContext } from "../rpc.js";
import { authorizeJobOperation, assertGrantLive } from "./authorization.js";
import {
  configFor,
  envelopeInput,
  guardJobRequest,
  optionalCursor,
  requiredText,
} from "./common.js";
import { decodeJobCursor, encodeJobCursor } from "./cursors.js";
import { descriptorFor, jobError, runtimeFor, trustedScopeFor } from "./support.js";
import { jobPolicy } from "./types.js";
import { projectStreamFrame } from "./projection.js";

export async function streamJobRun(
  options: RouteMaterializationOptions,
  context: RpcContext,
  job: TaskJobNode,
  value: unknown,
  signal?: AbortSignal,
): Promise<AsyncIterable<NamedStreamFrame<JsonValue>>> {
  const input = envelopeInput(value, ["runId", "name", "after", "expectedIdentity"]);
  await guardJobRequest(options, context, input, "stream");
  const config = configFor(options);
  const descriptor = await descriptorFor(config, job);
  const runtime = await runtimeFor(config, job);
  const runId = requiredText(input.runId, "run ID");
  const name = requiredText(input.name, "stream name");
  const policy = jobPolicy(job);
  if (!policy.streams.includes(name))
    throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job stream was not found.");
  const trusted = await trustedScopeFor(config, context, job, "stream");
  const authorized = await authorizeJobOperation(
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
  return (async function* () {
    for await (const frame of source) {
      assertGrantLive(authorized.grant);
      const streamSchema = descriptor.task.streams?.[name];
      if (frameIsChunk(frame) && streamSchema !== undefined) {
        try {
          await validateCanonicalOutput(streamSchema, frame.item, TASK_ITEM_MAX_BYTES);
        } catch {
          throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job stream data is not available.");
        }
      }
      const projected = projectStreamFrame(frame, runId, name);
      if (!("cursor" in projected) || projected.cursor === undefined) {
        yield projected;
        continue;
      }
      yield {
        ...projected,
        cursor: encodeJobCursor(config, owner, job, "stream", filters, projected.cursor),
      };
    }
  })();
}

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

function frameIsChunk(value: unknown): value is { readonly item: unknown } {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as Record<string, unknown>).kind === "chunk"
  );
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function"
  );
}
