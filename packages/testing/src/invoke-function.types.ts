import type { MaybePromise } from "@relkit/contracts";
import type {
  DependencyClientSources,
  FunctionRegistry,
  InvocationContext,
  InvocationHooks,
  InvocationIdSource,
} from "@relkit/engine";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";

/** Native function descriptor retaining input, output and dependency validation. */
export interface StandaloneFunctionTarget {
  readonly id: string;
  readonly input: StandardSchemaV1;
  readonly output: StandardSchemaV1;
  readonly errors?: readonly { readonly id: string; readonly data: StandardSchemaV1 }[];
  readonly dependencies?: import("@relkit/engine").DependencyDeclarations;
  readonly publishes?: readonly string[];
  readonly publications?: Readonly<Record<string, import("@relkit/engine").DependencyRefLike>>;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly handler: (...arguments_: readonly never[]) => MaybePromise<unknown>;
}

/**
 * Input inferred from the target's native schema authority.
 * @typeParam Target - Native descriptor determining the derived schema or handler type.
 */
export type FunctionInput<Target extends { readonly input: StandardSchemaV1 }> = InferInput<
  Target["input"]
>;

/**
 * Output inferred from the target's native schema authority.
 * @typeParam Target - Native descriptor determining the derived schema or handler type.
 */
export type FunctionOutput<Target extends { readonly output: StandardSchemaV1 }> = InferOutput<
  Target["output"]
>;

/**
 * Context inferred from the native handler, preserving required cancellation.
 * @typeParam Target - Native descriptor determining the derived schema or handler type.
 */
export type FunctionContextOf<Target> =
  Target extends Record<"handler", (input: infer _Input, context: infer Context) => unknown>
    ? Context extends { readonly signal: AbortSignal }
      ? Context
      : InvocationContext
    : InvocationContext;

/**
 * Direct invocation dependencies and native hooks without process environment reads.
 * @typeParam Context - Caller context patch retaining the native cancellation signal.
 */
export interface InvokeFunctionOptions<Context extends { readonly signal: AbortSignal }> {
  readonly registry?: FunctionRegistry;
  readonly env?: Readonly<Record<string, unknown>>;
  readonly clients?: DependencyClientSources;
  readonly signal?: AbortSignal;
  readonly now?: () => number;
  readonly idSource?: InvocationIdSource;
  readonly context?: InvocationHooks<Context>["context"];
  readonly hooks?: InvocationHooks<Context>;
}
