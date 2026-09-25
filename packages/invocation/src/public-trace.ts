import type { MaybePromise, TraceAttributes } from "@relkit/contracts";
import { traceEvent, traceRename, traceSetAttributes } from "./public-trace-events.js";
import { runTraceSpan } from "./public-trace-span.js";
import type {
  FrameworkSpanOptions,
  FrameworkTrace,
  PublicSpanOptions,
  PublicTrace,
} from "./public-trace.types.js";

export type {
  FrameworkSpanOptions,
  FrameworkTrace,
  PublicSpanOptions,
  PublicTrace,
} from "./public-trace.types.js";
export * from "./public-trace-attributes.js";
export * from "./public-trace-events.js";
export * from "./public-trace-span.js";

function publicSpan<A>(
  name: string,
  optionsOrCallback: PublicSpanOptions | (() => MaybePromise<A>),
  callback?: () => MaybePromise<A>,
): Promise<A> {
  return runTraceSpan(name, optionsOrCallback, callback);
}

function frameworkSpan<A>(
  name: string,
  optionsOrCallback: FrameworkSpanOptions | (() => MaybePromise<A>),
  callback?: () => MaybePromise<A>,
): Promise<A> {
  return runTraceSpan(name, optionsOrCallback, callback, true);
}

/** Handler-visible trace facade; every method reads the current execution scope.
 * @example await publicTrace.span("lookup", async () => 1);
 */
export const publicTrace: PublicTrace = Object.freeze({
  span: publicSpan,
  event(name: string, attributes: TraceAttributes = {}) {
    traceEvent(name, attributes, false);
  },
  setAttributes(attributes: TraceAttributes) {
    traceSetAttributes(attributes, false);
  },
});

/** Internal tracing facade that may set framework identity attributes.
 * @example frameworkTrace.event("invocation.started", { "relkit.id": "id" });
 */
export const frameworkTrace: FrameworkTrace = Object.freeze({
  span: frameworkSpan,
  event(name: string, attributes: TraceAttributes = {}) {
    traceEvent(name, attributes, true);
  },
  setAttributes(attributes: TraceAttributes) {
    traceSetAttributes(attributes, true);
  },
  rename(name: string) {
    traceRename(name);
  },
});
