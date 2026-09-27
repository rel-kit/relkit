import { expect, test } from "vitest";
import { Effect, Exit, Layer, Metric, Tracer } from "effect";
import { IdentityStore } from "@relkit/invocation";
import { defineFunction } from "@relkit/functions";
import { z } from "@relkit/schema";
import { defineMiddlewareEffect } from "../src/define-middleware.js";
import { defineRouteEffect } from "../src/define-route.js";
import { defineTransformEffect } from "../src/http-dsl.js";
import { httpEffects } from "../src/http-dsl-operations.js";
import { copyClientEffect } from "../src/route-client.js";
import {
  RouteOperationError,
  RouteTelemetry,
  observeRoute,
  routeTry,
  runRouteSync,
} from "../src/route-observability.js";

test("a test Layer observes successful and failed route operations", () => {
  const observed: string[] = [];
  const testTelemetry = Layer.succeed(RouteTelemetry, {
    observe: (operation, effect) =>
      Effect.onExit(effect, (exit) =>
        Effect.sync(() => {
          observed.push(`${operation}:${Exit.isSuccess(exit) ? "success" : "failure"}`);
        }),
      ),
  });
  const program = Effect.gen(function* () {
    expect(yield* copyClientEffect({ operation: "query" })).toEqual({ operation: "query" });
    const failure = yield* Effect.flip(copyClientEffect({ operation: "invalid" }));
    expect(failure).toBeInstanceOf(RouteOperationError);
    expect(failure.reason).toContain("query or mutation");
  });
  Effect.runSync(Effect.provide(program, testTelemetry));
  expect(observed).toEqual(["client.copy:success", "client.copy:failure"]);
});

test("the live observer records operation, duration, and failure metrics", () => {
  const attributes = { operation: "client.copy" };
  const operations = Metric.withAttributes(
    Metric.counter("relkit_route_operations_total", { incremental: true }),
    attributes,
  );
  const failures = Metric.withAttributes(
    Metric.counter("relkit_route_failures_total", { incremental: true }),
    attributes,
  );
  const duration = Metric.withAttributes(
    Metric.histogram("relkit_route_duration_ms", {
      boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
    }),
    attributes,
  );
  const program = Effect.gen(function* () {
    const beforeOperations = (yield* Metric.value(operations)).count;
    const beforeFailures = (yield* Metric.value(failures)).count;
    const beforeDuration = (yield* Metric.value(duration)).count;
    yield* copyClientEffect({ operation: "query" });
    yield* Effect.exit(copyClientEffect({ operation: "invalid" }));
    expect((yield* Metric.value(operations)).count - beforeOperations).toBe(2);
    expect((yield* Metric.value(failures)).count - beforeFailures).toBe(1);
    expect((yield* Metric.value(duration)).count - beforeDuration).toBe(2);
  });
  Effect.runSync(Effect.provideService(program, Metric.MetricRegistry, new Map()));
});

test("the live observer names the active Effect span", () => {
  const span = Effect.runSync(observeRoute("dsl.source", Effect.currentSpan));
  expect(span.name).toBe("routes.dsl.source");
});

test("a named route operation emits one span", () => {
  const spans: string[] = [];
  const tracer = Tracer.make({
    span: (options) => {
      spans.push(options.name);
      return new Tracer.NativeSpan(options);
    },
  });
  Effect.runSync(Effect.withTracer(copyClientEffect({ operation: "query" }), tracer));
  expect(spans.filter((name) => name === "routes.client.copy")).toEqual(["routes.client.copy"]);
});

test("nested route and mapping validation stays in the parent Effect runtime", () => {
  const operations = Metric.counter("relkit_route_operations_total", { incremental: true });
  const mappingValidation = Metric.withAttributes(operations, {
    operation: "validation.assert-mapping",
  });
  const clientCopy = Metric.withAttributes(operations, { operation: "client.copy" });
  const beforeMapping = Effect.runSync(Metric.value(mappingValidation)).count;
  const beforeClient = Effect.runSync(Metric.value(clientCopy)).count;
  Effect.runSync(httpEffects.input({ id: { kind: "path", name: "id" } }));
  const target = defineFunction({
    id: "test.observed-route-target",
    input: z.object({}),
    output: z.object({ ok: z.boolean() }),
    handler: async () => ({ ok: true }),
  });
  Effect.runSync(
    defineRouteEffect({ id: "test.observed-route", target, client: { operation: "query" } }),
  );
  expect(Effect.runSync(Metric.value(mappingValidation)).count).toBe(beforeMapping);
  expect(Effect.runSync(Metric.value(clientCopy)).count).toBe(beforeClient);
});

test("synchronous adapters preserve unexpected defects", () => {
  const defect = new Error("unexpected");
  expect(() => runRouteSync(Effect.die(defect))).toThrow(defect);
  const exit = Effect.runSyncExit(
    routeTry("dsl.source", () => {
      throw defect;
    }),
  );
  expect(Exit.isFailure(exit)).toBe(true);
});

test("unbound identities use a deterministic caller-provided Layer", () => {
  let next = 0;
  const store = {
    canonical: new WeakMap<object, string>(),
    unbound: new WeakMap<object, string>(),
    services: new WeakMap<object, object>(),
    nextUnboundId: () => String(++next),
  };
  const target = defineFunction({
    id: "test.route-target",
    input: z.object({}),
    output: z.object({ ok: z.boolean() }),
    handler: async () => ({ ok: true }),
  });
  const program = Effect.gen(function* () {
    const middleware = yield* defineMiddlewareEffect("/orders", async () => undefined);
    const route = yield* defineRouteEffect({ target });
    const transform = yield* defineTransformEffect({ schema: z.string() });
    expect([middleware.id, route.id, transform.id]).toEqual([
      "unbound.1",
      "unbound.2",
      "unbound.3",
    ]);
  });
  Effect.runSync(Effect.provide(program, Layer.succeed(IdentityStore, store)));
  expect(next).toBe(3);

  const invalid = Effect.flip(defineMiddlewareEffect("invalid", async () => undefined));
  Effect.runSync(Effect.provide(invalid, Layer.succeed(IdentityStore, store)));
  const invalidRoute = Effect.flip(defineRouteEffect({ target: {} as never }));
  Effect.runSync(Effect.provide(invalidRoute, Layer.succeed(IdentityStore, store)));
  expect(next).toBe(3);
});

test("identity source failures remain tagged and observable", () => {
  const failingStore = {
    canonical: new WeakMap<object, string>(),
    unbound: new WeakMap<object, string>(),
    services: new WeakMap<object, object>(),
    nextUnboundId: () => {
      throw new TypeError("ID source unavailable");
    },
  };
  const effect = defineMiddlewareEffect("/orders", async () => undefined);
  const failure = Effect.runSync(
    Effect.provide(Effect.flip(effect), Layer.succeed(IdentityStore, failingStore)),
  );
  expect(failure).toBeInstanceOf(RouteOperationError);
  expect(failure.reason).toContain("ID source unavailable");
});
