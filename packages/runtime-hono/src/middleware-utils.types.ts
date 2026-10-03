import type { MaybePromise, RequestId, SpanContext, TraceId } from "@relkit/contracts";
import type { RequestRecordBuilder, RequestRecordSink } from "@relkit/observability";
import type { RelkitSpan, SpanRuntime } from "@relkit/invocation";
import type { errorName } from "./middleware-utils.js";

/** State owned by middleware utils. */
export interface HttpRequestState {
  readonly requestId: RequestId;
  readonly traceId: TraceId;
  readonly remoteParent?: SpanContext;
  readonly serverSpan?: RelkitSpan;
  readonly signal: AbortSignal;
  readonly startedAt: number;
  readonly deadlineMs?: number;
  readonly requestRecord?: RequestRecordBuilder;
  readonly lifecycleStarted?: true;
  readonly runtimeSignal?: { current: AbortSignal; terminalLifecycle?: boolean };
}

/** Contract for request lifecycle type used by middleware utils. */
export type RequestLifecycleType =
  "request.started" | "request.completed" | "request.failed" | "request.cancelled";

/** Contract for request lifecycle event used by middleware utils. */
export interface RequestLifecycleEvent {
  readonly type: RequestLifecycleType;
  readonly requestId: RequestId;
  readonly traceId: TraceId;
  readonly method: string;
  readonly path: string;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly status?: number;
  readonly errorName?: string;
}

/** Contract for request lifecycle hooks used by middleware utils. */
export interface RequestLifecycleHooks {
  readonly emit?: (event: RequestLifecycleEvent) => MaybePromise<void>;
  readonly onStart?: (event: RequestLifecycleEvent) => MaybePromise<void>;
  readonly onComplete?: (event: RequestLifecycleEvent) => MaybePromise<void>;
  readonly onError?: (event: RequestLifecycleEvent) => MaybePromise<void>;
  readonly onCancel?: (event: RequestLifecycleEvent) => MaybePromise<void>;
}

/** http middleware options configuring dependencies, callbacks and runtime policy. */
export interface HttpMiddlewareOptions {
  readonly requestIdHeader?: string;
  readonly traceIdHeader?: string;
  readonly requestId?: () => string;
  readonly traceId?: () => string;
  readonly maxBodyBytes?: number;
  readonly timeoutMs?: number;
  readonly generationId?: string;
  readonly graphHash?: string;
  readonly now?: () => number;
  readonly observability?: RequestRecordSink;
  readonly lifecycle?: RequestLifecycleHooks;
  readonly onLifecycleEvent?: (event: RequestLifecycleEvent) => MaybePromise<void>;
  readonly spanRuntime?: SpanRuntime;
}
