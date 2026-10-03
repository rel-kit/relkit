import { ORPCError } from "@orpc/server";
import type { JsonValue } from "@relkit/contracts";
import type { JobClientOperation, RunSnapshot } from "@relkit/contracts/jobs";
import type { TaskJobNode } from "@relkit/graph";
import type { JobDescriptorAny, JobsRuntime } from "@relkit/jobs";
import { isJobDescriptor } from "@relkit/jobs";
import type { RouteMaterializationOptions } from "../materialize-routes.js";
import type { RpcContext } from "../rpc.js";
import { isJobsRuntime, mapEntry, runtimeEntry } from "./support-lookups.js";
import { jobPolicy, type JobsRpcRuntime, type TrustedJobScope } from "./types.js";

/** Public jobs failure codes mapped to their transport status without native details. */
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

/** Select durable task-backed jobs from the compiled execution plan.
 * @param options - Runtime configuration and dependencies for this operation.
 * @returns Task job nodes, excluding legacy function jobs.
 */
export function jobNodes(options: RouteMaterializationOptions): readonly TaskJobNode[] {
  return (options.plan.jobs ?? []).filter((job) => job.executionModel === "task");
}

/** Select task jobs declaring at least one public client operation.
 * @param options - Runtime configuration and dependencies for this operation.
 * @returns The publicly addressable task job nodes.
 */
export function exposedJobNodes(options: RouteMaterializationOptions): readonly TaskJobNode[] {
  return jobNodes(options).filter((job) => jobPolicy(job).operations.length > 0);
}

/** Find an exposed job by its public name.
 * @param options - Runtime configuration and dependencies for this operation.
 * @param name - Field, job or stream name.
 * @returns The matching task job node, or undefined.
 */
export function jobNodeFor(
  options: RouteMaterializationOptions,
  name: string,
): TaskJobNode | undefined {
  return exposedJobNodes(options).find((job) => job.name === name);
}

/** Resolve a job runtime using the explicit resolver or profile map.
 * @param config - Configured jobs runtime and cursor policy.
 * @param job - Compiled task job registration.
 * @returns The runtime serving the job's configured profile.
 */
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

/** Resolve a job descriptor by callback, job ID or graph node ID.
 * @param config - Configured jobs runtime and cursor policy.
 * @param job - Compiled task job registration.
 * @returns The validated descriptor or a public not-found error.
 */
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

/** Derive a validated job scope from the resolver, session or public defaults.
 * @param config - Configured jobs runtime and cursor policy.
 * @param context - Current Hono or RPC request context.
 * @param job - Compiled task job registration.
 * @param operation - Public job client operation.
 * @param input - Public job request data.
 * @param run - Persisted run being inspected.
 * @returns A frozen application/environment/scope identity.
 */
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

/** Constrain runtime operation contexts to one trusted job scope.
 * @param runtime - Native jobs runtime.
 * @param scope - Execution scope used to partition the operation.
 * @returns A frozen runtime facade overriding the operation scope.
 */
export function scopedRuntime(runtime: JobsRuntime, scope: string): JobsRuntime {
  return Object.freeze({
    ...runtime,
    scope,
    operationContext: (options: Parameters<JobsRuntime["operationContext"]>[0]) =>
      runtime.operationContext({ ...options, scope }),
  });
}

/** Require matching job, task version, build and trusted run scope.
 * @param run - Persisted run being inspected.
 * @param job - Compiled task job registration.
 * @param scope - Execution scope used to partition the operation.
 * @returns Nothing for a matching run; otherwise throws access denied.
 */
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

/** Require an authorization grant within the trusted scope hierarchy.
 * @param grant - Authorization grant to compare with the trusted scope.
 * @param scope - Execution scope used to partition the operation.
 * @returns Nothing for the same scope or a colon-delimited child scope.
 */
export function assertGrantScope(grant: { readonly scope: string }, scope: TrustedJobScope): void {
  if (grant.scope !== scope.scope && !grant.scope.startsWith(`${scope.scope}:`)) {
    throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job operation is not authorized.");
  }
}

/** Construct a public jobs RPC error without exposing native exceptions.
 * @param code - Stable public error or mapping issue code.
 * @param message - Public diagnostic message or browser message.
 * @param data - Public event or error payload.
 * @returns An ORPCError containing the explicit public message and data.
 */
export function jobError(code: string, message: string, data?: unknown) {
  return new ORPCError(code as never, {
    message,
    data: data ?? null,
  });
}

/** Validate bounded application, environment and trusted scope identifiers.
 * @param value - Value to validate or project.
 * @returns The frozen scope, or a public authorization error.
 */
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
