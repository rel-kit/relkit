import type { InvocationCallStack, InvocationDispatcher, TaskAncestry } from "@relkit/invocation";
import type {
  InvocationIdSource,
  InvocationParent,
  InvocationRecord,
  InvocationSource,
  InvocationTarget,
  InvokeOptions,
} from "./invoke-types.js";

/** Resolved invocation configuration captured before validation and admission. */
export interface InvocationStart<Input, Output, Context extends { readonly signal: AbortSignal }> {
  readonly options: InvokeOptions<Input, Output, Context>;
  readonly dispatcher: InvocationDispatcher;
  readonly parentChain: InvocationCallStack;
  readonly target: InvocationTarget<Input, Output, Context>;
  readonly serviceId: string | undefined;
  readonly source: InvocationSource;
  readonly now: number;
  readonly deadlineMs: number | undefined;
  readonly idSource: InvocationIdSource;
  readonly traceId: string;
  readonly record: InvocationRecord;
  readonly taskAncestry?: TaskAncestry;
}

/** Parent context enriched with the active shared span before direct dispatch. */
export interface MutableInvocationParent extends InvocationParent {
  spanId?: string;
  trace?: unknown;
}
