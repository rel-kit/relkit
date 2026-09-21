import { asyncIteratorObject, ORPCError, os, type AnyProcedure, type ErrorMap } from "@orpc/server";
import type { TaskJobNode } from "@relkit/graph";
import type { RouteMaterializationOptions } from "../materialize-routes.js";
import type { RpcContext } from "../rpc.js";
import {
  cancelJobRun,
  getJobRun,
  listJobRuns,
  retryJobRun,
  streamJobRun,
  triggerJob,
  watchJobRun,
} from "./handlers.js";
import { jobEnvelopeSchema, jobItemSchema } from "./common.js";
import { exposedJobNodes, jobNodeFor, jobsErrorStatuses } from "./support.js";
import { jobPolicy, jobsRuntime } from "./types.js";

export { jobsErrorStatuses };

export function jobsProcedures(
  options: RouteMaterializationOptions,
): Readonly<Record<string, unknown>> {
  if (jobsRuntime(options) === undefined) return {};
  const jobs = Object.fromEntries(
    exposedJobNodes(options).map((job) => [job.name, proceduresFor(options, job)]),
  );
  return Object.keys(jobs).length === 0 ? {} : { jobs };
}

function proceduresFor(
  options: RouteMaterializationOptions,
  job: TaskJobNode,
): Readonly<Record<string, AnyProcedure | Readonly<Record<string, AnyProcedure>>>> {
  const policy = jobPolicy(job);
  const result: Record<string, AnyProcedure | Record<string, AnyProcedure>> = {};
  if (policy.operations.includes("trigger")) {
    result.trigger = call(options, job, "trigger", triggerJob);
  }
  const runs: Record<string, AnyProcedure> = {};
  if (policy.operations.includes("get")) runs.get = call(options, job, "get", getJobRun);
  if (policy.operations.includes("list")) runs.list = call(options, job, "list", listJobRuns);
  if (policy.operations.includes("watch"))
    runs.watch = streamCall(options, job, "watch", watchJobRun);
  if (policy.operations.includes("stream"))
    runs.stream = streamCall(options, job, "stream", streamJobRun);
  if (policy.operations.includes("cancel"))
    runs.cancel = call(options, job, "cancel", cancelJobRun);
  if (policy.operations.includes("retry")) runs.retry = call(options, job, "retry", retryJobRun);
  if (Object.keys(runs).length > 0) result.runs = runs;
  return result;
}

function call(
  options: RouteMaterializationOptions,
  job: TaskJobNode,
  operation: "trigger" | "get" | "list" | "cancel" | "retry",
  handler: (
    options: RouteMaterializationOptions,
    context: RpcContext,
    job: TaskJobNode,
    input: unknown,
    signal?: AbortSignal,
  ) => Promise<unknown>,
): AnyProcedure {
  return os
    .$context<RpcContext>()
    .errors(jobErrors)
    .input(jobEnvelopeSchema)
    .handler(({ input, context, signal }) =>
      invoke(options, job, operation, () => handler(options, context, job, input, signal)),
    ) as AnyProcedure;
}

function streamCall(
  options: RouteMaterializationOptions,
  job: TaskJobNode,
  operation: "watch" | "stream",
  handler: (
    options: RouteMaterializationOptions,
    context: RpcContext,
    job: TaskJobNode,
    input: unknown,
    signal?: AbortSignal,
  ) => Promise<AsyncIterable<unknown>>,
): AnyProcedure {
  return os
    .$context<RpcContext>()
    .errors(jobErrors)
    .input(jobEnvelopeSchema)
    .output(asyncIteratorObject(jobItemSchema))
    .handler(({ input, context, signal }) =>
      invoke(options, job, operation, () => handler(options, context, job, input, signal)).then(
        (value) => asAsyncIterator(value as AsyncIterable<unknown>),
      ),
    ) as AnyProcedure;
}

async function invoke(
  options: RouteMaterializationOptions,
  job: TaskJobNode,
  operation: string,
  action: () => Promise<unknown>,
): Promise<unknown> {
  if (jobNodeFor(options, job.name) === undefined) {
    throw new ORPCError("NOT_FOUND", { message: "Job was not found." });
  }
  try {
    return await action();
  } catch (error) {
    if (error instanceof ORPCError) throw error;
    const code = errorCode(error);
    if (code !== undefined) {
      const data = errorData(error);
      throw new ORPCError<string, unknown>(code as string, {
        message: errorMessage(error),
        ...(data === undefined ? {} : { data }),
      });
    }
    throw error;
  }
}

function errorData(value: unknown): unknown {
  if (!isRecord(value)) return undefined;
  if (
    (value.code !== "RELKIT_JOB_SUBMISSION_UNKNOWN" &&
      value.code !== "RELKIT_JOB_CONTROL_UNKNOWN") ||
    value.outcome !== "unknown" ||
    typeof value.operationId !== "string" ||
    !isRecord(value.recovery) ||
    (value.recovery.action !== "retry-with-same-key" &&
      value.recovery.action !== "inspect-native" &&
      value.recovery.action !== "unavailable")
  ) {
    return undefined;
  }
  return {
    code: value.code,
    outcome: "unknown",
    operationId: value.operationId,
    ...(typeof value.idempotencyKey === "string" ? { idempotencyKey: value.idempotencyKey } : {}),
    recovery: {
      action: value.recovery.action,
      ...(typeof value.recovery.expiresAt === "string"
        ? { expiresAt: value.recovery.expiresAt }
        : {}),
    },
  };
}

const jobErrors = Object.fromEntries(
  Object.keys(jobsErrorStatuses).map((code) => [code, {}]),
) as ErrorMap;

function asAsyncIterator(value: AsyncIterable<unknown>): AsyncIteratorObject<unknown> {
  return value[Symbol.asyncIterator]() as AsyncIteratorObject<unknown>;
}

function errorCode(value: unknown): string | undefined {
  return value !== null &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).code === "string"
    ? ((value as Record<string, unknown>).code as string)
    : undefined;
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : "Job operation failed.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
