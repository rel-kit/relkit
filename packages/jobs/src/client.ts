import { normalizeId, type MaybePromise, type TracePropagation } from "@relkit/contracts";
import { currentTracePropagation, frameworkTrace } from "@relkit/invocation";
import type { JobEnqueueOptions, JobEnqueueResult } from "@relkit/functions";
import type { StandardIssue, StandardSchemaV1 } from "@relkit/schema";
import {
  assertOptions,
  assertOptionalText,
  normalizeResult,
  notify,
  parseInput,
  resolveCorrelation,
  resolveProvider,
  runAbortable,
} from "./client-utils.js";

export type { JobEnqueueOptions, JobEnqueueResult, JobState, JobStatus } from "@relkit/functions";
export interface JobOperationContext {
  readonly operation: "enqueue";
  readonly signal: AbortSignal;
  readonly profile: string;
  readonly deadlineMs?: number;
  readonly correlationId?: string;
  readonly propagation?: TracePropagation;
}
export interface JobProvider {
  readonly enqueue: (
    input: unknown,
    options: JobEnqueueOptions,
    context: JobOperationContext,
  ) => MaybePromise<JobProviderResult>;
}
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
export interface JobInvocationBridgeOptions {
  readonly name: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly signal: AbortSignal;
  readonly kind?: "producer";
  readonly input?: unknown;
}
export interface JobInvocationBridge {
  readonly run: <A>(
    operation: () => MaybePromise<A>,
    options?: JobInvocationBridgeOptions,
  ) => Promise<A>;
}
export interface JobDeclaredEdge {
  readonly kind: "enqueues-job";
  readonly from: string;
  readonly to: string;
}
export interface JobObservedEdge {
  readonly relationship: "enqueues-job";
  readonly from: string;
  readonly to: string;
}
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
export interface JobClient<Input = unknown> {
  readonly enqueue: (input: Input, options?: JobEnqueueOptions) => Promise<JobEnqueueResult>;
}

export class JobInputValidationError extends TypeError {
  readonly code = "RELKIT_JOB_INPUT_VALIDATION" as const;
  constructor(readonly issues: readonly StandardIssue[]) {
    super("Job input validation failed");
    this.name = "JobInputValidationError";
  }
}
export class JobProfileError extends Error {
  readonly code = "RELKIT_JOB_PROFILE_UNKNOWN" as const;
  constructor(readonly profile: string) {
    super(`Job profile "${profile}" is not configured`);
    this.name = "JobProfileError";
  }
}
export class JobProviderError extends Error {
  readonly code = "RELKIT_JOB_PROVIDER_UNAVAILABLE" as const;
  constructor() {
    super("Job provider does not implement enqueue");
    this.name = "JobProviderError";
  }
}

export class JobDependencyError extends Error {
  readonly code = "RELKIT_JOB_DEPENDENCY_UNDECLARED" as const;
  constructor(readonly jobId: string) {
    super(`Job dependency "${jobId}" is not declared on this function`);
    this.name = "JobDependencyError";
  }
}

export class JobOperationCancelledError extends Error {
  readonly code = "ABORT_ERR" as const;
  constructor() {
    super("Job operation cancelled");
    this.name = "AbortError";
  }
}

export class JobOperationTimeoutError extends Error {
  readonly code = "ETIMEDOUT" as const;
  constructor() {
    super("Job operation timed out");
    this.name = "TimeoutError";
  }
}

export function createJobClient(options: JobClientOptions): JobClient {
  const ownerId = normalizeId(options.ownerId);
  const jobId = normalizeId(options.jobId);
  const profile = normalizeId(options.profile ?? "default");
  const declared = options.declared !== false;
  const provider = declared
    ? resolveProvider(options.source, profile, options.resolveProfile)
    : ({} as JobProvider);
  notify(options.onDeclaredEdge, { kind: "enqueues-job", from: ownerId, to: jobId }, declared);

  const enqueue = async (
    input: unknown,
    request: JobEnqueueOptions = {},
  ): Promise<JobEnqueueResult> => {
    assertOptions(request);
    const signal = options.signal?.() ?? new AbortController().signal;
    const deadlineMs = options.deadline?.();
    const correlationId = request.correlationId ?? resolveCorrelation(options.correlationId);
    assertOptionalText(correlationId, "correlationId");
    notify(
      options.onObservedEdge,
      { relationship: "enqueues-job", from: ownerId, to: jobId },
      declared,
    );
    const work = async (): Promise<JobEnqueueResult> => {
      if (!declared) throw new JobDependencyError(jobId);
      if (signal.aborted) throw new JobOperationCancelledError();
      const value = await parseInput(options.inputSchema, input);
      const base = currentTracePropagation();
      const propagation =
        base === undefined || correlationId === undefined
          ? base
          : Object.freeze({ ...base, correlationId });
      const context = Object.freeze({
        operation: "enqueue" as const,
        signal,
        profile,
        ...(deadlineMs === undefined ? {} : { deadlineMs }),
        ...(correlationId === undefined ? {} : { correlationId }),
        ...(propagation === undefined ? {} : { propagation }),
      });
      const result = await provider.enqueue(
        value,
        Object.freeze({ ...request, ...(correlationId === undefined ? {} : { correlationId }) }),
        context,
      );
      return normalizeResult(result, profile, correlationId);
    };
    const bridged = options.bridge?.run(work, {
      name: `relkit.job.${jobId}.enqueue`,
      attributes: { "relkit.job.id": jobId, "relkit.job.profile": profile },
      input,
      signal,
      kind: "producer",
    });
    return bridged === undefined
      ? frameworkTrace.span(
          `relkit.job.${jobId}.enqueue`,
          {
            input,
            kind: "producer",
            attributes: { "relkit.job.id": jobId, "relkit.job.profile": profile },
          },
          () => runAbortable(signal, deadlineMs, work),
        )
      : bridged;
  };
  return Object.freeze({ enqueue });
}
