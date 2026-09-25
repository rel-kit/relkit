import {
  createSpanId,
  createTraceId,
  isSpanId,
  isTraceId,
  type TraceId,
  type SpanId,
} from "@relkit/contracts";
import { Context, Effect, Exit, Option, Tracer } from "effect";
import type { SpanCapture, SpanRuntime } from "./span-runtime.js";
import { boundedTraceText } from "./trace-limits.js";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import { setSpanAttribute } from "./span-attributes.js";
import { appendSpanLinks, captureSpan, completeSpan, recordSpanEvent } from "./span-operations.js";
import type { TraceEvent } from "./tracing-span.types.js";

export type { TraceEvent } from "./tracing-span.types.js";
/** A mutable span with bounded trace data and observed Effect operations.
 * @example const span = runtime.start(options);
 */
export class RelkitSpan implements Tracer.Span {
  readonly _tag = "Span" as const;
  readonly relkitInvocationSpan = true;
  readonly spanId: SpanId;
  readonly traceId: TraceId;
  readonly sampled: boolean;
  name: string;
  readonly parent: Option.Option<Tracer.AnySpan>;
  readonly annotations: Context.Context<never>;
  readonly links: Array<Tracer.SpanLink> = [];
  readonly events: TraceEvent[] = [];
  readonly startTime: bigint;
  readonly kind: Tracer.SpanKind;
  readonly recording: boolean;
  readonly traceState?: string;
  readonly budget: { spans: number; dropped: number };
  status: Tracer.SpanStatus;
  attributes = new Map<string, string | number | boolean>();
  revision = 0;
  droppedAttributes = 0;
  droppedEvents = 0;
  droppedLinks = 0;
  droppedUpdates = 0;
  captures: Partial<Record<"input" | "output", SpanCapture>> = {};
  private updates = 0;
  constructor(
    options: Parameters<Tracer.Tracer["span"]>[0],
    readonly runtime: SpanRuntime,
    rootTraceId?: string,
    initialAttributes: Readonly<Record<string, unknown>> = {},
  ) {
    const parent = Option.getOrUndefined(options.parent);
    this.name = boundedTraceText(options.name, runtime.limits.nameBytes);
    this.parent = options.parent;
    const traceId = parent?.traceId ?? rootTraceId ?? runtime.ids.next("trace");
    const spanId = runtime.ids.next("span");
    this.traceId = isTraceId(traceId) ? traceId : createTraceId();
    this.spanId = isSpanId(spanId) ? spanId : createSpanId();
    this.sampled = options.sampled;
    this.annotations = options.annotations;
    this.startTime = options.startTime;
    this.kind = options.kind;
    this.status = { _tag: "Started", startTime: options.startTime };
    this.budget = parent instanceof RelkitSpan ? parent.budget : { spans: 0, dropped: 0 };
    if (parent instanceof RelkitSpan && parent.traceState !== undefined)
      this.traceState = parent.traceState;
    this.recording =
      runtime.recording &&
      !runtime.closed &&
      runtime.active.size < runtime.limits.activeSpans &&
      this.budget.spans < runtime.limits.spansPerTrace;
    if (this.recording) this.budget.spans++;
    else this.budget.dropped++;
    for (const [key, value] of Object.entries(initialAttributes))
      if (!setSpanAttribute(this.attributes, key, value, this.runtime.limits))
        this.droppedAttributes++;
    this.addLinks(options.links, false);
  }
  /** Completes the span exactly once and notifies its runtime.
   * @param endTime - Monotonic completion time. @param exit - Invocation exit.
   * @returns An observed Effect with no expected failure.
   * @example Effect.runSync(span.endEffect(2n, Exit.void));
   */
  endEffect(endTime: bigint, exit: Exit.Exit<unknown, unknown>): Effect.Effect<void> {
    return observeInvocation(
      "span.end",
      Effect.sync(() => completeSpan(this, endTime, exit)),
    );
  }

  /** Synchronous Effect tracer completion adapter.
   * @param endTime - Monotonic completion time. @param exit - Invocation exit.
   * @example span.end(2n, Exit.void);
   */
  end(endTime: bigint, exit: Exit.Exit<unknown, unknown>): void {
    runInvocationSync(this.endEffect(endTime, exit));
  }
  /** Records one safe attribute through Effect.
   * @param key - Attribute key. @param value - Candidate scalar value.
   * @returns An observed Effect with no expected failure.
   * @example Effect.runSync(span.attributeEffect("status", 200));
   */
  attributeEffect(key: string, value: unknown): Effect.Effect<void> {
    return observeInvocation(
      "span.attribute",
      Effect.sync(() => {
        if (!this.writable()) return;
        if (!setSpanAttribute(this.attributes, key, value, this.runtime.limits))
          this.droppedAttributes++;
        this.update();
      }),
    );
  }

  /** Synchronous Effect tracer attribute adapter.
   * @param key - Attribute key. @param value - Candidate scalar value.
   * @example span.attribute("status", 200);
   */
  attribute(key: string, value: unknown): void {
    runInvocationSync(this.attributeEffect(key, value));
  }

  /** Renames the span through Effect with its text budget.
   * @param name - Candidate span name. @returns An observed Effect.
   * @example Effect.runSync(span.renameEffect("request"));
   */
  renameEffect(name: string): Effect.Effect<void> {
    return observeInvocation(
      "span.rename",
      Effect.sync(() => {
        if (!this.writable()) return;
        this.name = boundedTraceText(name, this.runtime.limits.nameBytes);
        this.update();
      }),
    );
  }

  /** Synchronous Effect tracer rename adapter. @param name - Candidate span name.
   * @example span.rename("request"); */
  rename(name: string): void {
    runInvocationSync(this.renameEffect(name));
  }

  /** Records a bounded event through Effect.
   * @param name - Event name. @param time - Event time. @param attributes - Event metadata.
   * @returns An observed Effect with no expected failure.
   * @example Effect.runSync(span.eventEffect("received", 2n));
   */
  eventEffect(
    name: string,
    time: bigint,
    attributes: Record<string, unknown> = {},
  ): Effect.Effect<void> {
    return observeInvocation(
      "span.event",
      Effect.sync(() => {
        if (!this.writable()) return;
        recordSpanEvent(this, name, time, attributes);
        this.update();
      }),
    );
  }

  /** Synchronous Effect tracer event adapter.
   * @param name - Event name. @param time - Event time. @param attributes - Event metadata.
   * @example span.event("received", 2n);
   */
  event(name: string, time: bigint, attributes: Record<string, unknown> = {}): void {
    runInvocationSync(this.eventEffect(name, time, attributes));
  }

  /** Captures a bounded input or output through Effect.
   * @param kind - Capture slot. @param value - Candidate payload.
   * @returns An observed Effect with no expected failure.
   * @example Effect.runSync(span.captureEffect("input", request));
   */
  captureEffect(kind: "input" | "output", value: unknown): Effect.Effect<void> {
    return observeInvocation(
      "span.capture",
      Effect.sync(() => {
        if (!this.writable()) return;
        if (!captureSpan(this, kind, value)) return;
        this.update();
      }),
    );
  }

  /** Synchronous capture adapter. @param kind - Capture slot. @param value - Candidate payload.
   * @example span.capture("input", request); */
  capture(kind: "input" | "output", value: unknown): void {
    runInvocationSync(this.captureEffect(kind, value));
  }

  /** Adds valid links up to the span's link budget through Effect.
   * @param links - Candidate span links. @param notify - Whether to emit an update.
   * @returns An observed Effect with no expected failure.
   * @example Effect.runSync(span.addLinksEffect([]));
   */
  addLinksEffect(links: ReadonlyArray<Tracer.SpanLink>, notify = true): Effect.Effect<void> {
    return observeInvocation(
      "span.links",
      Effect.sync(() => {
        if (!this.writable()) return;
        appendSpanLinks(this, links);
        if (notify && links.length > 0) this.update();
      }),
    );
  }

  /** Synchronous link adapter.
   * @param links - Candidate span links. @param notify - Whether to emit an update.
   * @example span.addLinks([]);
   */
  addLinks(links: ReadonlyArray<Tracer.SpanLink>, notify = true): void {
    runInvocationSync(this.addLinksEffect(links, notify));
  }

  private writable(): boolean {
    return this.recording && this.status._tag !== "Ended";
  }

  private update(): void {
    this.revision++;
    if (this.updates >= this.runtime.limits.updates) {
      this.droppedUpdates++;
      return;
    }
    this.updates++;
    this.runtime.notify("updated", this);
  }
}
