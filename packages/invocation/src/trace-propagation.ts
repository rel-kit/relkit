import { isSpanId, isTraceId, type TracePropagation } from "@relkit/contracts";
import { currentExecutionContext } from "./dispatcher-scope.js";

export function currentTracePropagation(): TracePropagation | undefined {
  const context = currentExecutionContext();
  if (!context || !isTraceId(context.span.traceId) || !isSpanId(context.span.spanId))
    return undefined;
  return Object.freeze({
    version: 2,
    producer: Object.freeze({
      traceId: context.span.traceId,
      spanId: context.span.spanId,
      traceFlags: context.span.sampled ? 1 : 0,
    }),
    ...(context.requestId === undefined ? {} : { requestId: context.requestId }),
    ...(context.originRequestId === undefined ? {} : { originRequestId: context.originRequestId }),
    ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
    ...(context.invocationId === undefined ? {} : { invocationId: context.invocationId }),
  });
}
