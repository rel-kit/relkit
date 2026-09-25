import { describe, expect, test } from "vitest";
import { Context, Effect, Exit, Layer, Option, Tracer } from "effect";
import { createSpanId, createTraceId } from "@relkit/contracts";
import { InvocationTelemetry, SpanRuntime } from "../src/index.js";
import type { InvocationOperation } from "../src/invocation-observability.js";

const options = {
  name: "request",
  parent: Option.none(),
  annotations: Context.empty(),
  links: [],
  startTime: 1n,
  kind: "server" as const,
  root: true,
  sampled: true,
};

describe("span Effect operations", () => {
  test("observes each mutation, bounds metadata, and preserves completed state", async () => {
    const operations: InvocationOperation[] = [];
    const telemetry = Layer.succeed(InvocationTelemetry, {
      observe: (operation, effect) => {
        operations.push(operation);
        return effect;
      },
    });
    const runtime = new SpanRuntime({
      ids: { next: (kind) => (kind === "trace" ? createTraceId() : createSpanId()) },
      limits: { attributes: 1, events: 1, links: 1, updates: 10 },
      capture: (value) => ({ bytes: 1, truncated: false, content: value as null }),
    });
    const span = runtime.start(options);
    const linked = Tracer.externalSpan({
      traceId: createTraceId(),
      spanId: createSpanId(),
      sampled: true,
    });
    const program = Effect.gen(function* () {
      yield* span.attributeEffect("key", "value");
      yield* span.attributeEffect("overflow", true);
      yield* span.renameEffect("renamed");
      yield* span.eventEffect("recorded", 2n, { safe: true });
      yield* span.eventEffect("dropped", 3n);
      yield* span.captureEffect("input", null);
      yield* span.addLinksEffect([{ span: linked, attributes: {} }]);
      yield* span.addLinksEffect([{ span: linked, attributes: {} }]);
      yield* span.endEffect(4n, Exit.void);
      yield* span.attributeEffect("late", true);
      yield* span.endEffect(5n, Exit.fail("late"));
    });
    await Effect.runPromise(Effect.provide(program, telemetry));
    expect(span.name).toBe("renamed");
    expect(span.attributes.get("key")).toBe("value");
    expect(span.droppedAttributes).toBe(1);
    expect(span.events).toHaveLength(1);
    expect(span.droppedEvents).toBe(1);
    expect(span.links).toHaveLength(1);
    expect(span.droppedLinks).toBe(1);
    expect(span.captures.input?.content).toBeNull();
    expect(span.status._tag).toBe("Ended");
    expect(operations).toEqual(
      expect.arrayContaining([
        "span.attribute",
        "span.rename",
        "span.event",
        "span.capture",
        "span.links",
        "span.end",
      ]),
    );
  });
});
