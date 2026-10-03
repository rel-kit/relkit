import type { MaybePromise } from "@relkit/contracts";
import type { JobClientOperation, RunSnapshot } from "@relkit/contracts/jobs";
import type { TaskJobNode } from "@relkit/graph";
import type { JobDescriptorAny, JobsRuntime } from "@relkit/jobs";
import type { HttpAuthInvocation } from "../auth.js";
import type { ManifestEntries, RouteMaterializationOptions } from "../materialize-routes.js";

/** Trusted resolver input containing the transport identity and selected job operation. */
export interface JobsScopeRequest {
  readonly request: Request;
  readonly auth: HttpAuthInvocation | undefined;
  readonly job: TaskJobNode;
  readonly operation: JobClientOperation;
  readonly input?: import("@relkit/contracts").JsonValue;
  readonly run?: RunSnapshot;
}

/** Job providers, descriptor resolution, public identity and cursor-signing configuration. */
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

/** Validated application/environment partition and optional authenticated subject. */
export interface TrustedJobScope {
  readonly application: string;
  readonly environment: string;
  readonly scope: string;
  readonly subject?: string;
}

/** Public operations, snapshot fields and stream names permitted for a job. */
export interface JobPolicyProjection {
  readonly operations: readonly JobClientOperation[];
  readonly fields: readonly ("status" | "input" | "progress" | "output" | "error")[];
  readonly streams: readonly string[];
}

/** Route materialization options requiring the jobs RPC configuration. */
export interface JobRpcOptions extends RouteMaterializationOptions {
  readonly jobs: JobsRpcRuntime;
}
