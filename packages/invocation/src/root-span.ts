import type { SpanContext } from "@relkit/contracts";
import { Context, Exit, Option, Tracer } from "effect";
import type { SpanRuntime } from "./span-runtime.js";
import type { RelkitSpan } from "./tracing-span.js";

export function startRootSpan(
  runtime: SpanRuntime,
  name: string,
  kind: "server" | "producer" | "consumer" | "internal",
  parent?: SpanContext,
  traceId?: string,
): RelkitSpan {
  const options: Parameters<Tracer.Tracer["span"]>[0] = {
    name,
    parent:
      parent === undefined
        ? Option.none()
        : Option.some(
            Tracer.externalSpan({
              traceId: parent.traceId,
              spanId: parent.spanId,
              sampled: (parent.traceFlags & 1) === 1,
            }),
          ),
    annotations: Context.empty(),
    links: [],
    startTime: BigInt(Date.now()) * 1_000_000n,
    kind,
    root: true,
    sampled: parent === undefined || (parent.traceFlags & 1) === 1,
  };
  return traceId === undefined ? runtime.start(options) : runtime.startRoot(options, traceId);
}

export function completeSpan(span: RelkitSpan, error?: unknown): void {
  span.end(BigInt(Date.now()) * 1_000_000n, error === undefined ? Exit.void : Exit.fail(error));
}
