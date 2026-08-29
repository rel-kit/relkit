import type { MaybePromise } from "@relkit/contracts";
import type {
  InvocationCompletion,
  InvocationContext,
  InvocationContextOptions,
  InvocationIdSource,
  InvocationParent,
  InvocationRecord,
  InvocationRunner,
  InvocationTarget,
  InvocationSource,
  PublicClock,
  PublicLogger,
} from "./contracts.js";
import type { InvocationCallStack } from "./recursion.js";

export const MANAGED_DEPENDENCY_CATEGORIES = [
  "jobs",
  "events",
  "buckets",
  "cache",
  "agents",
] as const;

export type ManagedDependencyCategory = (typeof MANAGED_DEPENDENCY_CATEGORIES)[number];

export type ManagedDependencySources = Partial<{
  readonly [Category in ManagedDependencyCategory]: Readonly<Record<string, unknown>>;
}>;

export type InvocationContextFactory<Context extends { readonly signal: AbortSignal }> = (
  options: InvocationContextOptions,
) => MaybePromise<Context>;

export interface StructuredLogRecord {
  readonly level: "trace" | "debug" | "info" | "warn" | "error";
  readonly message: string;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly timestamp: string;
  readonly invocationId: string;
  readonly traceId: string;
  readonly functionId: string;
  readonly source: InvocationSource;
  readonly serviceId?: string;
}

export interface LocalStructuredLogger extends PublicLogger {
  readonly records: readonly StructuredLogRecord[];
}

export interface InvocationDispatchOptions<
  Context extends { readonly signal: AbortSignal } = InvocationContext,
> {
  readonly source?: InvocationSource;
  readonly parent?: InvocationParent;
  readonly correlationId?: string;
  readonly traceId?: string;
  readonly deadlineMs?: number;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly toolHooks?: InvocationValueHooks<Context>;
  readonly env?: Readonly<Record<string, unknown>>;
  readonly now?: () => number;
  readonly time?: PublicClock;
  readonly logger?: PublicLogger;
  readonly clients?: ManagedDependencySources;
  readonly context?: InvocationContextFactory<Context>;
  readonly effectRunner?: InvocationRunner;
  readonly idSource?: InvocationIdSource;
  readonly onInvocationStart?: (record: InvocationRecord) => MaybePromise<void>;
  readonly onCompletion?: (completion: InvocationCompletion) => MaybePromise<void>;
  readonly onRelease?: (release: {
    readonly record: InvocationRecord;
    readonly admitted: boolean;
  }) => MaybePromise<void>;
}

export interface InvocationValueHooks<Context extends { readonly signal: AbortSignal }> {
  readonly onBefore?: (input: unknown, context: Context) => MaybePromise<unknown>;
  readonly onAfter?: (output: unknown, context: Context) => MaybePromise<unknown>;
}

export type StandaloneDispatcherOptions<
  Context extends { readonly signal: AbortSignal } = InvocationContext,
> = Omit<InvocationDispatchOptions<Context>, "source" | "parent">;

export interface InvocationDispatchRequest<
  Input = unknown,
  Output = unknown,
  Context extends { readonly signal: AbortSignal } = InvocationContext,
> {
  readonly target: InvocationTarget<Input, Output, Context>;
  readonly input: unknown;
  readonly options?: InvocationDispatchOptions<Context>;
}

export interface InvocationDispatcher {
  readonly dispatch: <
    Input = unknown,
    Output = unknown,
    Context extends { readonly signal: AbortSignal } = InvocationContext,
  >(
    request: InvocationDispatchRequest<Input, Output, Context>,
  ) => Promise<Output>;
}

export interface InvocationDispatchScope {
  readonly dispatcher: InvocationDispatcher;
  readonly parent?: InvocationParent;
  readonly chain?: InvocationCallStack;
}
