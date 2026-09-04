import {
  createSpanId,
  createTraceId,
  isSpanId,
  isTraceId,
  type TraceId,
  type SpanId,
} from "@relkit/contracts";
import { Context, Exit, Option, Tracer } from "effect";
import type { SpanCapture, SpanRuntime } from "./span-runtime.js";
import { boundedTraceText, safeTraceAttribute } from "./trace-limits.js";

export interface TraceEvent {
  name: string;
  readonly time: bigint;
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
  readonly droppedAttributes: number;
}
export class RelkitSpan implements Tracer.Span {
  readonly _tag = "Span" as const;
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
    for (const [key, value] of Object.entries(initialAttributes)) this.setAttribute(key, value);
    this.addLinks(options.links, false);
  }

  end(endTime: bigint, exit: Exit.Exit<unknown, unknown>): void {
    if (this.status._tag === "Ended") return;
    this.status = { _tag: "Ended", startTime: this.startTime, endTime, exit };
    this.revision++;
    this.runtime.active.delete(this);
    this.runtime.notify("completed", this);
  }

  attribute(key: string, value: unknown): void {
    if (!this.writable()) return;
    this.setAttribute(key, value);
    this.update();
  }

  rename(name: string): void {
    if (!this.writable()) return;
    this.name = boundedTraceText(name, this.runtime.limits.nameBytes);
    this.update();
  }

  event(name: string, time: bigint, attributes: Record<string, unknown> = {}): void {
    if (!this.writable()) return;
    if (this.events.length >= this.runtime.limits.events) this.droppedEvents++;
    else {
      const metadata = this.metadata(attributes);
      this.events.push(
        Object.freeze({
          name: boundedTraceText(name, this.runtime.limits.nameBytes),
          time,
          attributes: metadata.attributes,
          droppedAttributes: metadata.dropped,
        }),
      );
    }
    this.update();
  }

  capture(kind: "input" | "output", value: unknown): void {
    if (!this.writable()) return;
    const captured = this.runtime.capture(value);
    if (captured === undefined) return;
    this.captures[kind] = captured;
    this.update();
  }

  addLinks(links: ReadonlyArray<Tracer.SpanLink>, notify = true): void {
    if (!this.writable()) return;
    for (const link of links) {
      if (
        this.links.length >= this.runtime.limits.links ||
        !isTraceId(link.span.traceId) ||
        !isSpanId(link.span.spanId)
      ) {
        this.droppedLinks++;
        continue;
      }
      const metadata = this.metadata(link.attributes);
      this.links.push(
        Object.freeze({
          span: Tracer.externalSpan({
            traceId: link.span.traceId,
            spanId: link.span.spanId,
            sampled: link.span.sampled,
          }),
          attributes: metadata.attributes,
        }),
      );
      this.droppedAttributes += metadata.dropped;
    }
    if (notify && links.length > 0) this.update();
  }

  private writable(): boolean {
    return this.recording && this.status._tag !== "Ended";
  }

  private setAttribute(key: string, value: unknown): void {
    const limits = this.runtime.limits;
    const scalar = safeTraceAttribute(value, limits.attributeBytes);
    if (
      !key ||
      boundedTraceText(key, limits.keyBytes) !== key ||
      scalar === undefined ||
      (!this.attributes.has(key) && this.attributes.size >= limits.attributes)
    ) {
      this.droppedAttributes++;
    } else {
      this.attributes.set(key, scalar);
    }
  }

  private metadata(input: Readonly<Record<string, unknown>>) {
    const attributes: Record<string, string | number | boolean> = Object.create(null);
    let dropped = 0;
    let count = 0;
    for (const key of Object.keys(input)) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      const value =
        descriptor && "value" in descriptor
          ? safeTraceAttribute(descriptor.value, this.runtime.limits.attributeBytes)
          : undefined;
      if (
        !key ||
        boundedTraceText(key, this.runtime.limits.keyBytes) !== key ||
        value === undefined ||
        count >= this.runtime.limits.attributes
      ) {
        dropped++;
        continue;
      }
      attributes[key] = value;
      count++;
    }
    return { attributes: Object.freeze(attributes), dropped };
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
