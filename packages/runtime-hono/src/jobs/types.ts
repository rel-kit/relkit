import type { JobClientOperation } from "@relkit/contracts/jobs";
import type { TaskJobNode } from "@relkit/graph";
import type { JobAuthorizationContext } from "@relkit/jobs";
import type { RouteMaterializationOptions } from "../materialize-routes.js";
import type { JobPolicyProjection, JobsRpcRuntime } from "./runtime.types.js";
export type {
  JobPolicyProjection,
  JobRpcOptions,
  JobsRpcRuntime,
  JobsScopeRequest,
  TrustedJobScope,
} from "./runtime.types.js";

/** Resolve the preferred jobs configuration and its compatibility alias.
 * @param options - Runtime configuration and dependencies for this operation.
 * @returns The configured jobs runtime, or undefined.
 */
export function jobsRuntime(options: RouteMaterializationOptions): JobsRpcRuntime | undefined {
  return options.jobs ?? options.jobsRuntime;
}

/** Filter a job's client declaration to supported operations, fields and streams.
 * @param job - Compiled task job registration.
 * @returns The public projection and operation policy.
 */
export function jobPolicy(job: TaskJobNode): JobPolicyProjection {
  const value = isRecord(job.client) ? job.client : {};
  const operations = Array.isArray(value.operations) ? value.operations.filter(isJobOperation) : [];
  const fields = Array.isArray(value.fields) ? value.fields.filter(isJobField) : [];
  const streams = Array.isArray(value.streams)
    ? value.streams.filter((entry): entry is string => typeof entry === "string")
    : [];
  return { operations, fields, streams };
}

/** Recognize operations supported by the public jobs client.
 * @param value - Value to validate or project.
 * @returns Whether the value names a supported operation.
 */
export function isJobOperation(value: unknown): value is JobClientOperation {
  return ["trigger", "get", "list", "watch", "cancel", "retry", "stream"].includes(String(value));
}

/** Recognize job fields permitted in a public projection.
 * @param value - Value to validate or project.
 * @returns Whether the value is status, input, progress, output or error.
 */
function isJobField(value: unknown): value is "status" | "input" | "progress" | "output" | "error" {
  return ["status", "input", "progress", "output", "error"].includes(String(value));
}

/** Check whether a value is a non-null object suitable for field inspection.
 * @param value - Value to validate or project.
 * @returns Whether object fields can be inspected.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export type { JobAuthorizationContext };
