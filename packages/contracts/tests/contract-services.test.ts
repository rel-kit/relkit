import { describe, expect, test, vi } from "vitest";
import { Effect, Layer, Metric } from "effect";
import {
  ContractTelemetry,
  ContractTelemetryLive,
  createDescriptorBase,
  DescriptorError,
  DescriptorReferenceError,
  isDescriptorEffect,
  isRefEffect,
  JsonValueError,
  normalizeIdEffect,
  parseTraceParentEffect,
  RuntimeIntegrationPlanVersionError,
  serializeJsonEffect,
  SourceLocationError,
  StableIdError,
  SpanIdError,
  TraceIdError,
  TraceRandom,
  TraceRandomError,
  TraceRandomLive,
} from "../src/index.js";
describe("contract services and tagged failures", () => {
  test("substitutes telemetry through a deterministic Layer", () => {
    const observed: string[] = [];
    const telemetry = Layer.succeed(ContractTelemetry, {
      observe: (operation, effect) =>
        Effect.ensuring(
          effect,
          Effect.sync(() => {
            observed.push(operation);
          }),
        ),
    });
    expect(Effect.runSync(Effect.provide(normalizeIdEffect("orders.get"), telemetry))).toBe(
      "orders.get",
    );
    const error = Effect.runSync(
      Effect.flip(Effect.provide(normalizeIdEffect("bad/id"), telemetry)),
    );
    expect(error._tag).toBe("StableIdError");
    expect(observed).toEqual(["id.normalize", "id.normalize"]);
  });
  test("keeps nested validation operations in the supplied telemetry context", () => {
    const observed: string[] = [];
    const telemetry = Layer.succeed(ContractTelemetry, {
      observe: (operation, effect) =>
        Effect.tap(effect, () =>
          Effect.sync(() => {
            observed.push(operation);
          }),
        ),
    });
    const descriptor = createDescriptorBase("route", "orders.get");
    const parent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    Effect.runSync(
      Effect.provide(
        Effect.gen(function* () {
          yield* isRefEffect(descriptor.ref);
          yield* isDescriptorEffect(descriptor);
          yield* parseTraceParentEffect(parent, "vendor=state");
        }),
        telemetry,
      ),
    );
    expect(observed).toEqual([
      "descriptor.is-kind",
      "id.is-stable",
      "descriptor.is-ref",
      "descriptor.is-kind",
      "id.is-stable",
      "descriptor.is-kind",
      "id.is-stable",
      "descriptor.is-ref",
      "descriptor.is-descriptor",
      "trace-id.validate",
      "span-id.validate",
      "trace-context.parse-state",
      "trace-context.parse-parent",
    ]);
  });
  test.each([
    new StableIdError("invalid"),
    new JsonValueError("$", "invalid"),
    new SourceLocationError("invalid"),
    new RuntimeIntegrationPlanVersionError(0),
    new DescriptorError(),
    new DescriptorReferenceError(),
    new TraceIdError(),
    new SpanIdError(),
  ])("preserves TypeError compatibility for %s", (error) => {
    expect(error).toBeInstanceOf(TypeError);
    expect(error._tag).toBe(error.name);
  });
  test("composes the live telemetry Layer with the Effect metric registry", () => {
    const registry: Metric.MetricRegistry = new Map();
    const metric = Metric.withAttributes(
      Metric.counter("relkit_contract_operations_total", { incremental: true }),
      { operation: "id.normalize" },
    );
    const program = Effect.gen(function* () {
      yield* normalizeIdEffect("orders.get");
      return (yield* Metric.value(metric)).count;
    });
    const result = Effect.runSync(
      Effect.provideService(
        Effect.provide(program, ContractTelemetryLive),
        Metric.MetricRegistry,
        registry,
      ),
    );
    expect(result).toBe(1);
  });
  test("recovers expected failures by tag and retains structured context", () => {
    const invalidId = Effect.runSync(Effect.flip(normalizeIdEffect("bad/id")));
    expect(invalidId).toBeInstanceOf(StableIdError);
    expect(invalidId.reason).toContain("letters");
    expect(
      Effect.runSync(
        normalizeIdEffect("bad/id").pipe(
          Effect.catchTag("StableIdError", () => Effect.succeed("fallback")),
        ),
      ),
    ).toBe("fallback");
    const invalidJson = Effect.runSync(Effect.flip(serializeJsonEffect({ bad: undefined })));
    expect(invalidJson).toBeInstanceOf(JsonValueError);
    expect(invalidJson._tag).toBe("JsonValueError");
    expect(invalidJson.path).toBe('$["bad"]');
    expect(invalidJson.reason).toBe("undefined is not JSON data");
    expect(
      Effect.runSync(
        serializeJsonEffect(undefined).pipe(
          Effect.catchTag("JsonValueError", (error) => Effect.succeed(error.path)),
        ),
      ),
    ).toBe("$");
  });
  test("maps live random-source failures to a tagged error", () => {
    const random = vi.spyOn(crypto, "getRandomValues").mockImplementation(() => {
      throw new Error("entropy unavailable");
    });
    try {
      const fill = Effect.gen(function* () {
        const service = yield* TraceRandom;
        yield* service.fill(new Uint8Array(8));
      });
      const error = Effect.runSync(Effect.flip(Effect.provide(fill, TraceRandomLive)));
      expect(error).toBeInstanceOf(TraceRandomError);
      expect(error.cause).toBeInstanceOf(Error);
      expect(error.message).toBe("Secure randomness is unavailable");
    } finally {
      random.mockRestore();
    }
  });
});
