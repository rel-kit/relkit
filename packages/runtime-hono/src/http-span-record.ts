import { spanSnapshot, type SpanLifecycle } from "@relkit/invocation";
import type { SpanRecord } from "@relkit/observability";
import type { HttpMiddlewareOptions } from "./middleware-utils.js";

/** Admits HTTP span records through the configured observability sink.
 * @param event - Event or record being projected into the target protocol.
 * @param options - Application dependencies and configuration for this domain.
 * @returns Nothing; the requested update is applied to the owned state.
 */
export function collectHttpSpan(event: SpanLifecycle, options: HttpMiddlewareOptions): void {
  const record = spanSnapshot(event) as SpanRecord;
  try {
    options.observability?.collect(record);
  } catch {}
}
