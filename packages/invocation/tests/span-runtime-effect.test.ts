import { describe, expect, test } from "vitest";
import { Context, Effect, Option } from "effect";
import { TestClock } from "effect/testing";
import { createSpanId, createTraceId } from "@relkit/contracts";
import { SpanRuntime } from "../src/index.js";

describe("span runtime Effect", () => {
  test("uses Effect operations for start, capture, notify, and close", async () => {
    const runtime = new SpanRuntime({
      ids: { next: (kind) => kind === "trace" ? createTraceId() : createSpanId() },
      observer: () => { throw new Error("observer failed"); },
      capture: (value) => ({ bytes: 1, truncated: false, content: value as null }),
    });
    const options = {
      name: "request", parent: Option.none(), annotations: Context.empty(), links: [],
      startTime: 1n, kind: "server" as const, root: true, sampled: true,
    };
    const program = Effect.gen(function* () {
      const span = yield* runtime.startRootEffect(options, createTraceId());
      yield* runtime.notifyEffect("updated", span);
      const capture = yield* runtime.captureEffect(null);
      yield* TestClock.adjust(10);
      yield* runtime.closeEffect();
      return { span, capture };
    });
    const { span, capture } = await Effect.runPromise(Effect.provide(program, TestClock.layer()));
    expect(capture).toEqual({ bytes: 1, truncated: false, content: null });
    expect(span.status._tag).toBe("Ended");
    expect(runtime.observerFailures).toBeGreaterThan(0);
    expect(runtime.closed).toBe(true);
  });
});
