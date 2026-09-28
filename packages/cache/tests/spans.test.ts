import { expect, test } from "vitest";
import { Effect, Tracer } from "effect";
import { cacheRuntimeLayer, getCacheEffect } from "../src/client.js";
test("emits stable operation spans for success and failure", async () => {
  const spans: string[] = [];
  const tracer = Tracer.make({
    span(options) {
      spans.push(options.name);
      return Tracer.nativeTracer.span(options);
    },
  });
  const success = cacheRuntimeLayer({
    ownerId: "orders",
    cacheId: "prices",
    source: { get: () => 1 },
  });
  const failure = cacheRuntimeLayer({ ownerId: "orders", cacheId: "prices", source: {} });
  await Effect.runPromise(
    Effect.withTracer(
      Effect.gen(function* () {
        yield* getCacheEffect("sku").pipe(Effect.provide(success));
        yield* Effect.flip(getCacheEffect("sku").pipe(Effect.provide(failure)));
      }),
      tracer,
    ),
  );
  expect(spans.filter((name) => name === "cache.get")).toHaveLength(2);
  expect(spans).toContain("cache.operation");
});
