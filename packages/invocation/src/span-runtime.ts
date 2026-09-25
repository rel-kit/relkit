import { Clock, Effect, Exit, type Tracer } from "effect";
import { RelkitSpan } from "./tracing-span.js";
import { traceLimits, type TraceLimits } from "./trace-limits.js";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type { SpanCapture, SpanIdSource, SpanLifecycle, SpanRuntimeOptions } from "./span-runtime.types.js";

export type { SpanCapture, SpanIdSource, SpanLifecycle, SpanLifecycleObserver, SpanRuntimeOptions } from "./span-runtime.types.js";

/** One owner per generation; never disables the process-wide context carrier.
 * @example new SpanRuntime({ ids });
 */
export class SpanRuntime {
  readonly limits: TraceLimits;
  readonly active = new Set<RelkitSpan>();
  readonly ids: SpanIdSource;
  readonly recording: boolean;
  droppedSpans = 0;
  observerFailures = 0;
  closed = false;

  constructor(private readonly options: SpanRuntimeOptions) {
    const state = runInvocationSync(observeInvocation("span.runtime-create", Effect.sync(() => ({
      ids: options.ids,
      limits: traceLimits(options.limits),
      recording: options.recording !== false,
    }))));
    this.ids = state.ids;
    this.limits = state.limits;
    this.recording = state.recording;
  }

  /** Starts a child span through Effect.
   * @param options - Effect tracer span options.
   * @param attributes - Initial attributes.
   * @returns New span with no expected failure.
   * @example Effect.runSync(runtime.startEffect(options));
   */
  startEffect(options: Parameters<Tracer.Tracer["span"]>[0], attributes?: Readonly<Record<string, unknown>>): Effect.Effect<RelkitSpan> {
    return observeInvocation("span.runtime-start", Effect.sync(() => {
      const span = new RelkitSpan(options, this, undefined, attributes);
      if (span.recording) {
        this.active.add(span);
        this.notify("started", span);
      } else this.droppedSpans++;
      return span;
    }));
  }

  /** Synchronous child span adapter.
   * @param options - Effect tracer span options.
   * @param attributes - Initial attributes.
   * @returns New span.
   * @example runtime.start(options);
   */
  start(
    options: Parameters<Tracer.Tracer["span"]>[0],
    attributes?: Readonly<Record<string, unknown>>,
  ): RelkitSpan {
    return runInvocationSync(this.startEffect(options, attributes));
  }

  /** Starts a span with an explicit root trace ID through Effect.
   * @param options - Effect tracer span options.
   * @param traceId - Root trace ID.
   * @param attributes - Initial attributes.
   * @returns New root span with no expected failure.
   * @example Effect.runSync(runtime.startRootEffect(options, traceId));
   */
  startRootEffect(options: Parameters<Tracer.Tracer["span"]>[0], traceId: string, attributes?: Readonly<Record<string, unknown>>): Effect.Effect<RelkitSpan> {
    return observeInvocation("span.runtime-root", Effect.sync(() => {
      const span = new RelkitSpan(options, this, traceId, attributes);
      if (span.recording) {
        this.active.add(span);
        this.notify("started", span);
      } else this.droppedSpans++;
      return span;
    }));
  }

  /** Synchronous explicit-root adapter.
   * @param options - Effect tracer span options.
   * @param traceId - Root trace ID.
   * @param attributes - Initial attributes.
   * @returns New root span.
   * @example runtime.startRoot(options, traceId);
   */
  startRoot(
    options: Parameters<Tracer.Tracer["span"]>[0],
    traceId: string,
    attributes?: Readonly<Record<string, unknown>>,
  ): RelkitSpan {
    return runInvocationSync(this.startRootEffect(options, traceId, attributes));
  }

  /** Notifies the optional observer without allowing it to replace invocation results.
   * @param type - Lifecycle event kind.
   * @param span - Changed span.
   * @returns Void; observer failures increment a counter.
   * @example Effect.runSync(runtime.notifyEffect("started", span));
   */
  notifyEffect(type: SpanLifecycle["type"], span: RelkitSpan): Effect.Effect<void> {
    return observeInvocation("span.runtime-notify", Effect.sync(() => {
      if (!span.recording) return;
      try {
        const result = this.options.observer?.({ type, span, revision: span.revision });
        if (result !== undefined)
          void Promise.resolve(result).catch(() => { this.observerFailures++; });
      } catch { this.observerFailures++; }
    }));
  }

  /** Synchronous observer adapter.
   * @param type - Lifecycle event kind.
   * @param span - Changed span.
   * @returns Void.
   * @example runtime.notify("completed", span);
   */
  notify(type: SpanLifecycle["type"], span: RelkitSpan): void {
    runInvocationSync(this.notifyEffect(type, span));
  }

  /** Captures bounded payload data through Effect.
   * @param value - Input or output value.
   * @returns Captured data or undefined; callback failures are ignored.
   * @example Effect.runSync(runtime.captureEffect(input));
   */
  captureEffect(value: unknown): Effect.Effect<SpanCapture | undefined> {
    return observeInvocation("span.runtime-capture", Effect.sync(() => {
      try { return this.options.capture?.(value); }
      catch { return undefined; }
    }));
  }

  /** Synchronous capture adapter.
   * @param value - Input or output value.
   * @returns Captured data or undefined.
   * @example runtime.capture(input);
   */
  capture(value: unknown): SpanCapture | undefined {
    return runInvocationSync(this.captureEffect(value));
  }

  /** Ends remaining spans when a runtime generation closes.
   * @param now - Optional explicit end time; defaults to the Effect Clock.
   * @returns Void with no expected failure.
   * @example Effect.runSync(runtime.closeEffect());
   */
  closeEffect(now?: bigint): Effect.Effect<void> {
    const runtime = this;
    return observeInvocation("span.runtime-close", Effect.gen(function* () {
      if (runtime.closed) return;
      const endTime = now ?? (yield* Clock.currentTimeNanos);
      runtime.closed = true;
      for (const span of runtime.active) {
        span.attribute("relkit.incomplete", true);
        span.end(endTime, Exit.fail("generation-closed"));
      }
    }));
  }

  /** Synchronous runtime close adapter.
   * @param now - Optional explicit end time.
   * @returns Void.
   * @example runtime.close();
   */
  close(now?: bigint): void {
    runInvocationSync(this.closeEffect(now));
  }
}
