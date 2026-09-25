import type { Tracer } from "effect";
import type { SpanRuntime } from "./span-runtime.js";
export type { SpanContext } from "@relkit/contracts";
export type { RelkitSpan } from "./tracing-span.js";

/** Current request and trace scope carried across invocation callbacks.
 * Optional correlation fields are inherited by nested invocation work.
 * @example const context = currentExecutionContext();
 */
export interface ExecutionContext {
  readonly span: Tracer.AnySpan;
  readonly runtime: SpanRuntime;
  readonly tracer?: Tracer.Tracer;
  readonly requestId?: string;
  readonly originRequestId?: string;
  readonly invocationId?: string;
  readonly parentInvocationId?: string;
  readonly functionId?: string;
  readonly serviceId?: string;
  readonly generationId?: string;
  readonly graphHash?: string;
  readonly correlationId?: string;
}
