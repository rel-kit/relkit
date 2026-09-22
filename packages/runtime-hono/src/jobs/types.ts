import type { MaybePromise } from "@relkit/contracts";
import type {
  JobAccessGrant,
  JobAccessRequest,
  JobClientOperation,
  JobRunStatus,
  RunSnapshot,
} from "@relkit/contracts/jobs";
import type { JobDescriptorAny, JobAuthorizationContext, JobsRuntime } from "@relkit/jobs";
import type { TaskJobNode } from "@relkit/graph";
import type { HttpAuthInvocation } from "../auth.js";
import type { ManifestEntries, RouteMaterializationOptions } from "../materialize-routes.js";

export interface JobsScopeRequest {
  readonly request: Request;
  readonly auth: HttpAuthInvocation | undefined;
  readonly job: TaskJobNode;
  readonly operation: JobClientOperation;
  readonly input?: import("@relkit/contracts").JsonValue;
  readonly run?: RunSnapshot;
}

export interface JobsRpcRuntime {
  readonly runtimes?:
    | JobsRuntime
    | ReadonlyMap<string, JobsRuntime>
    | Readonly<Record<string, JobsRuntime>>
    | (() =>
        JobsRuntime | ReadonlyMap<string, JobsRuntime> | Readonly<Record<string, JobsRuntime>>);
  readonly resolveRuntime?: (job: TaskJobNode) => MaybePromise<JobsRuntime | undefined>;
  readonly descriptors?: ManifestEntries<unknown>;
  readonly tasks?: ManifestEntries<unknown>;
  readonly resolveDescriptor?: (job: TaskJobNode) => MaybePromise<JobDescriptorAny | undefined>;
  readonly resolveScope?: (input: JobsScopeRequest) => MaybePromise<TrustedJobScope>;
  readonly application?: string;
  readonly environment?: string;
  readonly publicScope?: string;
  readonly publicFingerprint?: string;
  readonly protocolVersion?: number;
  readonly cursorSecret?: string | Uint8Array;
  readonly authTimeoutMs?: number;
}

export interface TrustedJobScope {
  readonly application: string;
  readonly environment: string;
  readonly scope: string;
  readonly subject?: string;
}

export interface JobPolicyProjection {
  readonly operations: readonly JobClientOperation[];
  readonly fields: readonly ("status" | "input" | "progress" | "output" | "error")[];
  readonly streams: readonly string[];
}

export interface JobRpcOptions extends RouteMaterializationOptions {
  readonly jobs: JobsRpcRuntime;
}

export function jobsRuntime(options: RouteMaterializationOptions): JobsRpcRuntime | undefined {
  return options.jobs ?? options.jobsRuntime;
}

export function jobPolicy(job: TaskJobNode): JobPolicyProjection {
  const value = isRecord(job.client) ? job.client : {};
  const operations = Array.isArray(value.operations) ? value.operations.filter(isJobOperation) : [];
  const fields = Array.isArray(value.fields) ? value.fields.filter(isJobField) : [];
  const streams = Array.isArray(value.streams)
    ? value.streams.filter((entry): entry is string => typeof entry === "string")
    : [];
  return { operations, fields, streams };
}

export function isJobOperation(value: unknown): value is JobClientOperation {
  return ["trigger", "get", "list", "watch", "cancel", "retry", "stream"].includes(String(value));
}

function isJobField(value: unknown): value is "status" | "input" | "progress" | "output" | "error" {
  return ["status", "input", "progress", "output", "error"].includes(String(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export type { JobAuthorizationContext };
