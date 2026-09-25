import type { MaybePromise } from "@relkit/contracts";
import type { ExecutionContext } from "./execution-context.types.js";
import type {
  InvocationCompletion,
  InvocationContext,
  InvocationIdSource,
  InvocationParent,
  InvocationRecord,
  InvocationRunner,
  InvocationSource,
  InvocationTarget,
  PublicClock,
  PublicLogger,
} from "./contracts.js";
import type { InvocationCallStack } from "./recursion.js";
import type { InvocationContextFactory } from "./dispatcher-context.types.js";
import type { ManagedDependencySources } from "./dispatcher-categories.types.js";
import type { ProgressSink } from "./progress.types.js";

/** Controls one standalone or scoped invocation.
 * A child inherits its parent's signal and deadline unless a tighter value is supplied.
 * Completion and release hooks observe the result and must not change it.
 * @typeParam Context - Context shape passed to the target handler.
 * @example const options: InvocationDispatchOptions = { timeoutMs: 5_000 };
 */
export interface InvocationDispatchOptions<
  Context extends { readonly signal: AbortSignal } = InvocationContext,
> {
  readonly source?: InvocationSource;
  readonly parent?: InvocationParent;
  readonly taskAncestry?: TaskAncestry;
  readonly correlationId?: string;
  readonly traceId?: string;
  readonly deadlineMs?: number;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly toolHooks?: InvocationValueHooks<Context>;
  readonly env?: Readonly<Record<string, unknown>>;
  /** Supplies the current Unix timestamp.
   * @returns Time in milliseconds.
   * @example now: () => Date.now();
   */
  readonly now?: () => number;
  readonly time?: PublicClock;
  readonly logger?: PublicLogger;
  readonly clients?: ManagedDependencySources;
  readonly context?: InvocationContextFactory<Context>;
  readonly effectRunner?: InvocationRunner;
  readonly idSource?: InvocationIdSource;
  readonly progressSink?: ProgressSink;
  /** Observes a newly created invocation record.
   * @param record - Started invocation record.
   * @returns Completion of the observational hook.
   * @example onInvocationStart: (record) => console.log(record.id);
   */
  readonly onInvocationStart?: (record: InvocationRecord) => MaybePromise<void>;
  /** Observes a completed invocation.
   * @param completion - Final record and outcome.
   * @returns Completion of the observational hook.
   * @example onCompletion: (completion) => console.log(completion.outcome);
   */
  readonly onCompletion?: (completion: InvocationCompletion) => MaybePromise<void>;
  /** Observes resource release after completion.
   * @param release - Record and admission state.
   * @returns Completion of the observational hook.
   * @example onRelease: ({ admitted }) => console.log(admitted);
   */
  readonly onRelease?: (release: {
    readonly record: InvocationRecord;
    readonly admitted: boolean;
  }) => MaybePromise<void>;
}

/** User supplied value transforms before and after handler execution.
 * Hook outputs are validated before the next lifecycle stage starts.
 * @example const hooks: InvocationValueHooks<InvocationContext> = { onBefore: (value) => value };
 */
export interface InvocationValueHooks<Context extends { readonly signal: AbortSignal }> {
  /** Transforms input before the handler.
   * @param input - Validated input value.
   * @param context - Restricted hook context.
   * @returns Input for the handler.
   * @example onBefore: (input) => input;
   */
  readonly onBefore?: (input: unknown, context: Context) => MaybePromise<unknown>;
  /** Transforms handler output before final validation.
   * @param output - Handler result.
   * @param context - Restricted hook context.
   * @returns Final output candidate.
   * @example onAfter: (output) => output;
   */
  readonly onAfter?: (output: unknown, context: Context) => MaybePromise<unknown>;
}

/** Default options for a standalone dispatcher, excluding per-call source and parent.
 * Per-call options may override these defaults when dispatch starts.
 * @example const options: StandaloneDispatcherOptions = { timeoutMs: 1_000 };
 */
export type StandaloneDispatcherOptions<
  Context extends { readonly signal: AbortSignal } = InvocationContext,
> = Omit<InvocationDispatchOptions<Context>, "source" | "parent">;

/** Target, input, and optional controls for a single dispatch.
 * The input is validated against the target's schema before its handler runs.
 * @example await dispatchInvocation({ target, input: { id: "order-1" } });
 */
export interface InvocationDispatchRequest<
  Input = unknown,
  Output = unknown,
  Context extends { readonly signal: AbortSignal } = InvocationContext,
> {
  readonly target: InvocationTarget<Input, Output, Context>;
  readonly input: unknown;
  readonly options?: InvocationDispatchOptions<Context>;
}

/** Promise-compatible dispatch boundary shared by scoped and standalone calls.
 * The dispatcher preserves the target's public success and failure shapes.
 * @example await dispatcher.dispatch({ target, input });
 */
export interface InvocationDispatcher {
  /** Runs a target invocation.
   * @param request - Target, input, and dispatch options.
   * @returns The target output or its established public failure.
   * @example await dispatcher.dispatch({ target, input });
   */
  readonly dispatch: <
    Input = unknown,
    Output = unknown,
    Context extends { readonly signal: AbortSignal } = InvocationContext,
  >(
    request: InvocationDispatchRequest<Input, Output, Context>,
  ) => Promise<Output>;
}

/** Dynamic scope inherited by nested invocation calls.
 * A nested dispatch uses the active dispatcher, parent record, and ancestry.
 * @example runInInvocationScope({ dispatcher }, () => dispatchInvocation(request));
 */
export interface InvocationDispatchScope {
  readonly dispatcher?: InvocationDispatcher;
  readonly parent?: InvocationParent;
  readonly chain?: InvocationCallStack;
  readonly execution?: ExecutionContext;
  readonly taskAncestry?: TaskAncestry;
  readonly jobsRuntime?: unknown;
}

/** Correlation identifiers for nested job task invocations.
 * These IDs tie child invocations to one task attempt.
 * @example const ancestry: TaskAncestry = { runId: "run-1", taskId: "task-1" };
 */
export interface TaskAncestry {
  readonly runId: string;
  readonly taskId: string;
  readonly jobId?: string;
  readonly taskVersion?: string;
  readonly buildId?: string;
  readonly attempt?: number;
}

/** Substitutable lookup and fallback boundary for invocation dispatch.
 * Tests can provide a Layer to replace both the active lookup and fallback.
 * @example const layer = Layer.succeed(DispatcherBoundary, boundary);
 */
export interface DispatcherBoundaryService {
  /** Finds the dispatcher in the current invocation scope.
   * @returns The active dispatcher, if any.
   * @example boundary.current();
   */
  readonly current: () => InvocationDispatcher | undefined;
  /** Creates a standalone dispatcher when no scope is active.
   * @returns A standalone dispatcher.
   * @example boundary.fallback();
   */
  readonly fallback: () => InvocationDispatcher;
}
