import type { InvocationTraceOptions } from "@zsys/runtime-effect";
import {
  emitObservabilityEvent,
  OBSERVABILITY_HOOK_PROTOCOL,
  OBSERVABILITY_HOOK_VERSION,
} from "./observability.js";
import { callHook } from "./invoke-utils.js";
import type {
  InvocationRecord,
  InvocationSource,
  InvocationTarget,
  InvokeOptions,
  SpanRecord,
} from "./invoke-types.js";

export function createInvocationSpanOptions<
  Input,
  Output,
  Context extends { readonly signal: AbortSignal },
>(
  target: InvocationTarget<Input, Output, Context>,
  record: InvocationRecord,
  options: InvokeOptions<Input, Output, Context>,
  controller: AbortController,
): InvocationTraceOptions {
  return {
    name: `zsys.invoke.${target.id}`,
    invocationId: record.id,
    functionId: target.id,
    ...(record.serviceId === undefined ? {} : { serviceId: record.serviceId }),
    ...(record.parentId === undefined ? {} : { parentInvocationId: record.parentId }),
    ...(record.correlationId === undefined ? {} : { correlationId: record.correlationId }),
    source: record.source,
    signal: controller.signal,
    attributes: { "zsys.function.id": target.id },
    observer: (event) => {
      const span = event.span;
      const parentSpanId = options.parent?.spanId;
      const value: SpanRecord = Object.freeze({
        invocationId: record.id,
        functionId: target.id,
        name: span.name,
        spanId: span.spanId,
        ...(parentSpanId === undefined ? {} : { parentSpanId }),
        traceId: span.traceId,
        source: record.source as InvocationSource,
        ...(record.serviceId === undefined ? {} : { serviceId: record.serviceId }),
        status: event.type,
        startedAt: record.startedAt,
        ...(event.type === "completed" ? { completedAt: new Date().toISOString() } : {}),
      });
      void callHook(
        event.type === "started" ? options.hooks?.onSpanStart : options.hooks?.onSpanComplete,
        value,
      );
      void emitObservabilityEvent(options.hooks?.observability, {
        protocol: OBSERVABILITY_HOOK_PROTOCOL,
        version: OBSERVABILITY_HOOK_VERSION,
        type: event.type === "started" ? "span.started" : "span.completed",
        record: value,
      });
    },
  };
}
