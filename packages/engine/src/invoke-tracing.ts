import type { InvocationTraceOptions } from "@relkit/runtime-effect";
import {
  emitObservabilityEvent,
  OBSERVABILITY_HOOK_PROTOCOL,
  OBSERVABILITY_HOOK_VERSION,
} from "./observability.js";
import { callHook } from "./invoke-utils.js";
import type {
  InvocationRecord,
  InvocationTarget,
  InvokeOptions,
  SpanRecord,
} from "./invoke-types.js";
import { spanSnapshot } from "@relkit/invocation";

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
  const observed =
    options.hooks?.onSpanStart !== undefined ||
    options.hooks?.onSpanComplete !== undefined ||
    options.hooks?.observability !== undefined;
  return {
    name: `relkit.invoke.${target.id}`,
    invocationId: record.id,
    functionId: target.id,
    ...(record.serviceId === undefined ? {} : { serviceId: record.serviceId }),
    ...(record.parentId === undefined ? {} : { parentInvocationId: record.parentId }),
    ...(record.correlationId === undefined ? {} : { correlationId: record.correlationId }),
    source: record.source,
    signal: controller.signal,
    attributes: { "relkit.function.id": target.id },
    ...(observed
      ? {
          observer: (event: Parameters<NonNullable<InvocationTraceOptions["observer"]>>[0]) => {
            const span = event.span;
            const value = spanSnapshot(event) as SpanRecord;
            if (event.type !== "updated")
              void callHook(
                event.type === "started"
                  ? options.hooks?.onSpanStart
                  : options.hooks?.onSpanComplete,
                value,
              );
            void emitObservabilityEvent(options.hooks?.observability, {
              protocol: OBSERVABILITY_HOOK_PROTOCOL,
              version: OBSERVABILITY_HOOK_VERSION,
              type:
                event.type === "started"
                  ? "span.started"
                  : event.type === "updated"
                    ? "span.updated"
                    : "span.completed",
              record: value,
            });
          },
        }
      : {}),
  };
}
