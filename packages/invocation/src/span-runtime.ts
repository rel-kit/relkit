import { Exit, type Tracer } from "effect";
import type { JsonValue } from "@relkit/contracts";
import { RelkitSpan } from "./tracing-span.js";
import { traceLimits, type TraceLimits } from "./trace-limits.js";

export interface SpanLifecycle {
  readonly type: "started" | "updated" | "completed";
  readonly span: RelkitSpan;
  readonly revision: number;
}

export type SpanLifecycleObserver = (event: SpanLifecycle) => unknown;
export type SpanIdSource = { readonly next: (kind: "trace" | "span") => string };
export interface SpanCapture {
  readonly bytes: number;
  readonly truncated: boolean;
  readonly content?: JsonValue;
}

export interface SpanRuntimeOptions {
  readonly ids: SpanIdSource;
  readonly observer?: SpanLifecycleObserver;
  readonly limits?: Partial<TraceLimits>;
  readonly recording?: boolean;
  readonly capture?: (value: unknown) => SpanCapture | undefined;
}

/** One owner per generation; never disables the process-wide context carrier. */
export class SpanRuntime {
  readonly limits: TraceLimits;
  readonly active = new Set<RelkitSpan>();
  readonly ids: SpanIdSource;
  readonly recording: boolean;
  droppedSpans = 0;
  observerFailures = 0;
  closed = false;

  constructor(private readonly options: SpanRuntimeOptions) {
    this.ids = options.ids;
    this.limits = traceLimits(options.limits);
    this.recording = options.recording !== false;
  }

  start(
    options: Parameters<Tracer.Tracer["span"]>[0],
    attributes?: Readonly<Record<string, unknown>>,
  ): RelkitSpan {
    const span = new RelkitSpan(options, this, undefined, attributes);
    if (span.recording) {
      this.active.add(span);
      this.notify("started", span);
    } else {
      this.droppedSpans++;
    }
    return span;
  }

  startRoot(
    options: Parameters<Tracer.Tracer["span"]>[0],
    traceId: string,
    attributes?: Readonly<Record<string, unknown>>,
  ): RelkitSpan {
    const span = new RelkitSpan(options, this, traceId, attributes);
    if (span.recording) {
      this.active.add(span);
      this.notify("started", span);
    } else this.droppedSpans++;
    return span;
  }

  notify(type: SpanLifecycle["type"], span: RelkitSpan): void {
    if (!span.recording) return;
    try {
      const result = this.options.observer?.({ type, span, revision: span.revision });
      if (result !== undefined)
        void Promise.resolve(result).catch(() => {
          this.observerFailures++;
        });
    } catch {
      this.observerFailures++;
    }
  }

  capture(value: unknown): SpanCapture | undefined {
    try {
      return this.options.capture?.(value);
    } catch {
      return undefined;
    }
  }

  close(now = BigInt(Date.now()) * 1_000_000n): void {
    if (this.closed) return;
    this.closed = true;
    for (const span of this.active) {
      span.attribute("relkit.incomplete", true);
      span.end(now, Exit.fail("generation-closed"));
    }
  }
}
