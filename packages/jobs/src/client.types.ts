import type { MaybePromise, TracePropagation } from "@relkit/contracts";
import type { JobEnqueueOptions, JobEnqueueResult } from "@relkit/functions";
import type { StandardSchemaV1 } from "@relkit/schema";
import type { Effect } from "effect";
import type { JobClientFailure } from "./client.js";
/** Trusted job, scope, and signal data available during a client operation. */
export interface JobOperationContext {
  readonly operation: "enqueue";
  readonly signal: AbortSignal;
  readonly profile: string;
  readonly deadlineMs?: number;
  readonly correlationId?: string;
  readonly propagation?: TracePropagation;
}
/** Provider callback used to resolve the jobs runtime. */
export interface JobProvider {
  readonly enqueue: (
    input: unknown,
    options: JobEnqueueOptions,
    context: JobOperationContext,
  ) => MaybePromise<JobProviderResult>;
}
/** Runtime or handle returned by the job provider. */
export type JobProviderResult = Pick<JobEnqueueResult, "instanceId" | "accepted"> &
  Partial<
    Pick<
      JobEnqueueResult,
      | "status"
      | "profile"
      | "correlationId"
      | "duplicate"
      | "idempotencyKey"
      | "idempotencyExpiresAt"
    >
  >;
/** Options accepted for job invocation bridge operations. */
export interface JobInvocationBridgeOptions {
  readonly name: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly signal: AbortSignal;
  readonly kind?: "producer";
  readonly input?: unknown;
}
/** Bridge for invoking jobs from a task execution context. */
export interface JobInvocationBridge {
  readonly run: <A>(
    operation: () => MaybePromise<A>,
    options?: JobInvocationBridgeOptions,
  ) => Promise<A>;
}
/** Declared dependency between a task and job. */
export interface JobDeclaredEdge {
  readonly kind: "enqueues-job";
  readonly from: string;
  readonly to: string;
}
/** Job edge recorded during a concrete invocation. */
export interface JobObservedEdge {
  readonly relationship: "enqueues-job";
  readonly from: string;
  readonly to: string;
}
/** Options accepted for job client operations. */
export interface JobClientOptions {
  readonly ownerId: string;
  readonly jobId: string;
  readonly source: unknown;
  readonly inputSchema?: StandardSchemaV1;
  readonly profile?: string;
  readonly resolveProfile?: (profile: string) => unknown;
  readonly bridge?: JobInvocationBridge;
  readonly signal?: () => AbortSignal;
  readonly deadline?: () => number | undefined;
  readonly correlationId?: string | (() => string | undefined);
  readonly declared?: boolean;
  readonly onDeclaredEdge?: (edge: JobDeclaredEdge) => void;
  readonly onObservedEdge?: (edge: JobObservedEdge) => void;
}
/** Client operations exposed for a job through its provider. */
export interface JobClient<Input = unknown> {
  readonly enqueue: (input: Input, options?: JobEnqueueOptions) => Promise<JobEnqueueResult>;
}
/** A client whose enqueue operation is directly available in Effect. */
export interface EffectJobClient<Input = unknown> extends JobClient<Input> {
  readonly enqueueEffect: (
    input: Input,
    options?: JobEnqueueOptions,
  ) => Effect.Effect<JobEnqueueResult, JobClientFailure>;
}
/** Resolved dependencies shared by a client's enqueue operations. */
export interface JobClientState {
  readonly options: JobClientOptions;
  readonly ownerId: string;
  readonly jobId: string;
  readonly profile: string;
  readonly declared: boolean;
  readonly provider: JobProvider;
}
