import { ORPCError } from "@orpc/server";
import type { JsonValue } from "@relkit/contracts";
import type { JobAccessRequest, JobClientOperation, RunSnapshot } from "@relkit/contracts/jobs";
import type { JobDescriptorAny, JobsRuntime } from "@relkit/jobs";
import { isJobDescriptor } from "@relkit/jobs";
import type { TaskJobNode } from "@relkit/graph";
import type { RouteMaterializationOptions } from "../materialize-routes.js";
import type { RpcContext } from "../rpc.js";
import { jobPolicy, jobsRuntime, type JobsRpcRuntime, type TrustedJobScope } from "./types.js";

export const jobsErrorStatuses = {
  RELKIT_JOB_ACCESS_DENIED: 404,
  RELKIT_JOB_CURSOR_INVALID: 400,
  RELKIT_JOB_PROTOCOL_UNSUPPORTED: 409,
  RELKIT_JOB_PUBLIC_CONTRACT_STALE: 409,
  RELKIT_JOB_RUN_NOT_FOUND: 404,
  RELKIT_JOB_STREAM_UNSUPPORTED: 409,
  RELKIT_JOB_SUBMISSION_UNKNOWN: 503,
  RELKIT_JOB_CONTROL_UNKNOWN: 503,
} as const;

export function jobNodes(options: RouteMaterializationOptions): readonly TaskJobNode[] {
  return (options.plan.jobs ?? []).filter((job) => job.executionModel === "task");
}

export function exposedJobNodes(options: RouteMaterializationOptions): readonly TaskJobNode[] {
  return jobNodes(options).filter((job) => jobPolicy(job).operations.length > 0);
}

export function jobNodeFor(
  options: RouteMaterializationOptions,
  name: string,
): TaskJobNode | undefined {
  return exposedJobNodes(options).find((job) => job.name === name);
}

export async function runtimeFor(config: JobsRpcRuntime, job: TaskJobNode): Promise<JobsRuntime> {
  const resolved = await config.resolveRuntime?.(job);
  if (resolved !== undefined) return resolved;
  const source = typeof config.runtimes === "function" ? config.runtimes() : config.runtimes;
  if (source !== undefined && isJobsRuntime(source)) return source;
  const value = runtimeEntry(source, job.profile);
  if (value === undefined)
    throw jobError("RELKIT_JOB_RUN_NOT_FOUND", "Job service is unavailable.");
  return value;
}

export async function descriptorFor(
  config: JobsRpcRuntime,
  job: TaskJobNode,
): Promise<JobDescriptorAny> {
  const resolved = await config.resolveDescriptor?.(job);
  if (resolved !== undefined) return resolved;
  const entry = mapEntry(config.descriptors, job.jobId) ?? mapEntry(config.descriptors, job.id);
  if (isJobDescriptor(entry)) return entry;
  throw jobError("RELKIT_JOB_RUN_NOT_FOUND", "Job descriptor is unavailable.");
}

export async function trustedScopeFor(
  config: JobsRpcRuntime,
  context: RpcContext,
  job: TaskJobNode,
  operation: JobClientOperation,
  input?: JsonValue,
  run?: RunSnapshot,
): Promise<TrustedJobScope> {
  if (config.resolveScope !== undefined) {
    return validateScope(
      await config.resolveScope({
        request: context.hono.req.raw,
        auth: context.auth,
        job,
        operation,
        ...(input === undefined ? {} : { input }),
        ...(run === undefined ? {} : { run }),
      }),
    );
  }
  let scope = config.publicScope ?? `public:${config.application ?? "default"}`;
  let subject: string | undefined;
  const client = job.client;
  const isPublic =
    client !== undefined &&
    client !== null &&
    typeof client === "object" &&
    "public" in client &&
    client.public === true;
  if (!isPublic && context.auth !== undefined) {
    const session = await context.auth.getSession().catch(() => null);
    if (session !== null && typeof session === "object") {
      const candidate = session as Record<string, unknown>;
      if (typeof candidate.id === "string") {
        scope = `subject:${candidate.id}`;
        subject = candidate.id;
      }
    }
  }
  if (config.application === undefined || config.environment === undefined) {
    return validateScope({
      application: config.application ?? "default",
      environment: config.environment ?? "development",
      scope,
      ...(subject === undefined ? {} : { subject }),
    });
  }
  return validateScope({
    application: config.application,
    environment: config.environment,
    scope,
    ...(subject === undefined ? {} : { subject }),
  });
}

export function scopedRuntime(runtime: JobsRuntime, scope: string): JobsRuntime {
  return Object.freeze({
    ...runtime,
    scope,
    operationContext: (options: Parameters<JobsRuntime["operationContext"]>[0]) =>
      runtime.operationContext({ ...options, scope }),
  });
}

export function assertRunForJob(run: RunSnapshot, job: TaskJobNode, scope: TrustedJobScope): void {
  if (
    run.jobId !== job.jobId ||
    run.taskId !== job.taskId ||
    run.taskVersion !== job.taskVersion ||
    (job.buildId !== undefined && run.buildId !== job.buildId) ||
    run.scope !== scope.scope
  ) {
    throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job run was not found.");
  }
}

export function assertGrantScope(grant: { readonly scope: string }, scope: TrustedJobScope): void {
  if (grant.scope !== scope.scope && !grant.scope.startsWith(`${scope.scope}:`)) {
    throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job operation is not authorized.");
  }
}

export function jobError(code: string, message: string, data?: unknown) {
  return new ORPCError(code as never, {
    message,
    data: data ?? null,
  });
}

function mapEntry(entries: RouteMaterializationOptions["manifest"]["jobs"], key: string): unknown {
  if (entries === undefined) return undefined;
  if (typeof (entries as ReadonlyMap<string, unknown>).get === "function") {
    return (entries as ReadonlyMap<string, unknown>).get(key);
  }
  return (entries as Readonly<Record<string, unknown>>)[key];
}

function runtimeEntry(
  source:
    | JobsRuntime
    | ReadonlyMap<string, JobsRuntime>
    | Readonly<Record<string, JobsRuntime>>
    | undefined,
  key: string,
): JobsRuntime | undefined {
  if (source === undefined || isJobsRuntime(source)) return undefined;
  if (typeof (source as ReadonlyMap<string, JobsRuntime>).get === "function") {
    return (source as ReadonlyMap<string, JobsRuntime>).get(key);
  }
  return (source as Readonly<Record<string, JobsRuntime>>)[key];
}

function isJobsRuntime(value: unknown): value is JobsRuntime {
  return value !== null && typeof value === "object" && "adapter" in value && "scope" in value;
}

function validateScope(value: TrustedJobScope): TrustedJobScope {
  for (const text of [value.application, value.environment, value.scope]) {
    if (
      typeof text !== "string" ||
      text.length === 0 ||
      new TextEncoder().encode(text).byteLength > 256
    ) {
      throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job operation is not authorized.");
    }
  }
  return Object.freeze(value);
}
