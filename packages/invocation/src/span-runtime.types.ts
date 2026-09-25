import type { JsonValue } from "@relkit/contracts";
import type { TraceLimits } from "./trace-limits.types.js";
import type { RelkitSpan } from "./tracing-span.js";

/** Span lifecycle event emitted to an optional observer.
 * Revision increases whenever the span changes.
 * @example function observe(event: SpanLifecycle) { console.log(event.type); }
 */
export interface SpanLifecycle {
  readonly type: "started" | "updated" | "completed";
  readonly span: RelkitSpan;
  readonly revision: number;
}

/** Observer callback; failures are counted but never replace invocation results.
 * @param event - Changed span and revision.
 * @returns An optional observation result; rejection is counted locally.
 * @example const observer: SpanLifecycleObserver = (event) => console.log(event.type);
 */
export type SpanLifecycleObserver = (event: SpanLifecycle) => unknown;

/** Source of trace and span IDs for one runtime generation.
 * @example const ids: SpanIdSource = { next: (kind) => `${kind}-1` };
 */
export type SpanIdSource = { readonly next: (kind: "trace" | "span") => string };

/** Captured and bounded input or output payload metadata.
 * Content is omitted when capture is disabled or cannot produce safe JSON.
 * @example const capture: SpanCapture = { bytes: 12, truncated: false, content: { ok: true } };
 */
export interface SpanCapture {
  readonly bytes: number;
  readonly truncated: boolean;
  readonly content?: JsonValue;
}

/** Limits, IDs, capture, and observer options for a span runtime.
 * The runtime generation owns every span it creates and closes them together.
 * @example const runtime = new SpanRuntime({ ids });
 */
export interface SpanRuntimeOptions {
  readonly ids: SpanIdSource;
  readonly observer?: SpanLifecycleObserver;
  readonly limits?: Partial<TraceLimits>;
  readonly recording?: boolean;
  /** Captures a bounded JSON representation of a value.
   * @param value - Input or output value.
   * @returns Captured metadata, or undefined when capture is disabled.
   * @example const capture = (value: unknown) => ({ bytes: 0, truncated: false });
   */
  readonly capture?: (value: unknown) => SpanCapture | undefined;
}
