import { spanSnapshot, type SpanLifecycle } from "@relkit/invocation";
import type { SpanRecord } from "@relkit/observability";
import type { HttpMiddlewareOptions } from "./middleware-utils.js";

export function collectHttpSpan(event: SpanLifecycle, options: HttpMiddlewareOptions): void {
  const record = spanSnapshot(event) as SpanRecord;
  try {
    options.observability?.collect(record);
  } catch {}
}
