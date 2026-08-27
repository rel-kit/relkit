import { Context, Exit, Option, Tracer as EffectTracer } from "effect";
import type { IdSourceService } from "./services.js";

export interface SpanLifecycle {
  readonly type: "started" | "completed";
  readonly span: EffectTracer.Span;
}

export type SpanLifecycleObserver = (event: SpanLifecycle) => void;

class RelkitSpan implements EffectTracer.Span {
  readonly _tag = "Span" as const;
  readonly spanId: string;
  readonly traceId: string;
  readonly sampled: boolean;
  readonly name: string;
  readonly parent: Option.Option<EffectTracer.AnySpan>;
  readonly annotations: Context.Context<never>;
  readonly links: Array<EffectTracer.SpanLink>;
  readonly startTime: bigint;
  readonly kind: EffectTracer.SpanKind;
  status: EffectTracer.SpanStatus;
  attributes = new Map<string, unknown>();

  constructor(
    options: Parameters<EffectTracer.Tracer["span"]>[0],
    ids: Pick<IdSourceService, "next">,
    private readonly observer: SpanLifecycleObserver | undefined,
  ) {
    this.name = options.name;
    this.parent = options.parent;
    this.traceId = Option.getOrUndefined(options.parent)?.traceId ?? ids.next("trace");
    this.spanId = ids.next("span");
    this.sampled = options.sampled;
    this.annotations = options.annotations;
    this.links = [...options.links];
    this.startTime = options.startTime;
    this.kind = options.kind;
    this.status = { _tag: "Started", startTime: options.startTime };
    this.observer?.({ type: "started", span: this });
  }

  end(endTime: bigint, exit: Exit.Exit<unknown, unknown>): void {
    if (this.status._tag === "Ended") return;
    this.status = { _tag: "Ended", startTime: this.startTime, endTime, exit };
    this.observer?.({ type: "completed", span: this });
  }

  attribute(key: string, value: unknown): void {
    this.attributes.set(key, value);
  }

  event(_name: string, _startTime: bigint, _attributes?: Record<string, unknown>): void {}

  addLinks(links: ReadonlyArray<EffectTracer.SpanLink>): void {
    this.links.push(...links);
  }
}

/** Creates an Effect tracer whose IDs come from the generation-owned source. */
export function createRelkitTracer(
  ids: Pick<IdSourceService, "next">,
  observer?: SpanLifecycleObserver,
): EffectTracer.Tracer {
  return EffectTracer.make({
    span: (options) => new RelkitSpan(options, ids, observer),
  });
}
