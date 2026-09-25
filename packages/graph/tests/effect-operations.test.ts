import { describe, expect, test } from "vitest";
import { Effect, Layer, Metric } from "effect";
import { GRAPH_VERSION } from "@relkit/contracts";
import {
  GraphCanonicalizationError,
  GraphProductionError,
  GraphTelemetry,
  GraphTelemetryLive,
  assertProductionGraph,
  assertProductionGraphEffect,
  canonicalizeGraphEffect,
  graphId,
  graphIdEffect,
  isGraphEdgeKindEffect,
  isGraphNodeKindEffect,
  isTaskBackedJobEffect,
  validateGraphShapeEffect,
  type ApplicationGraph,
} from "../src/index.js";
const source = { file: "src/app.ts", line: 1, column: 1 } as const;
const unsafeGraph: ApplicationGraph = {
  contractVersion: GRAPH_VERSION,
  nodes: [
    {
      kind: "trigger",
      id: "orders.route",
      source,
      triggerType: "http",
      targetFunctionId: "orders.create",
      config: {
        method: "GET",
        path: "/orders",
        request: {},
        responses: [],
        middleware: [],
        transforms: [],
        rateLimit: { limit: 10, windowMs: 1000, key: {} },
      },
    },
  ],
  edges: [],
};
describe("graph Effect boundaries", () => {
  test("runs pure predicates and identity mapping through Effects and adapters", () => {
    expect(Effect.runSync(graphIdEffect("task", "orders.send"))).toBe("task.orders.send");
    expect(graphId("job", "orders.send", { taskBackedJob: true })).toBe("job.orders.send");
    expect(Effect.runSync(isTaskBackedJobEffect({ task: { ref: { kind: "task" } } }))).toBe(true);
    expect(Effect.runSync(isGraphNodeKindEffect("function"))).toBe(true);
    expect(Effect.runSync(isGraphEdgeKindEffect("unknown"))).toBe(false);
  });
  test("recovers production validation by tag and retains route context", () => {
    const error = Effect.runSync(Effect.flip(assertProductionGraphEffect(unsafeGraph)));
    expect(error).toBeInstanceOf(GraphProductionError);
    expect(error.routeId).toBe("orders.route");
    expect(
      Effect.runSync(
        assertProductionGraphEffect(unsafeGraph).pipe(
          Effect.catchTag("GraphProductionError", ({ routeId }) => Effect.succeed(routeId)),
        ),
      ),
    ).toBe("orders.route");
    expect(() => assertProductionGraph(unsafeGraph)).toThrow(Error);
    expect(() => assertProductionGraph(unsafeGraph)).toThrow("shared rate-limit cache store");
  });
  test("uses a tagged canonicalization failure and keeps synchronous TypeError compatibility", () => {
    const malformed = {
      contractVersion: GRAPH_VERSION,
      nodes: null,
      edges: [],
    } as unknown as ApplicationGraph;
    const error = Effect.runSync(Effect.flip(canonicalizeGraphEffect(malformed)));
    expect(error).toBeInstanceOf(GraphCanonicalizationError);
    expect(error.message).toBe("A graph must contain nodes and edges arrays.");
  });
  test("substitutes telemetry with a deterministic Layer", () => {
    const observed: string[] = [];
    const telemetry = Layer.succeed(GraphTelemetry, {
      observe: (operation, effect) =>
        Effect.ensuring(
          effect,
          Effect.sync(() => {
            observed.push(operation);
          }),
        ),
    });
    Effect.runSync(Effect.provide(graphIdEffect("task", "orders.send"), telemetry));
    Effect.runSync(
      Effect.flip(Effect.provide(assertProductionGraphEffect(unsafeGraph), telemetry)),
    );
    expect(observed).toEqual(["id.graph", "production.assert"]);
  });
  test("uses the supplied telemetry layer while validating graph nodes", () => {
    const observed: string[] = [];
    const telemetry = Layer.succeed(GraphTelemetry, {
      observe: (operation, effect) =>
        Effect.ensuring(
          effect,
          Effect.sync(() => {
            observed.push(operation);
          }),
        ),
    });
    const graph: ApplicationGraph = {
      contractVersion: GRAPH_VERSION,
      nodes: [{ kind: "app", id: "orders", source }],
      edges: [],
    };
    Effect.runSync(Effect.provide(validateGraphShapeEffect(graph), telemetry));
    expect(observed).toContain("validation.node");
  });
  test("records success and failure metrics in the live Layer", () => {
    const registry: Metric.MetricRegistry = new Map();
    const operations = Metric.withAttributes(
      Metric.counter("relkit_graph_operations_total", { incremental: true }),
      { operation: "production.assert" },
    );
    const failures = Metric.withAttributes(
      Metric.counter("relkit_graph_failures_total", { incremental: true }),
      { operation: "production.assert" },
    );
    const duration = Metric.withAttributes(
      Metric.histogram("relkit_graph_duration_ms", { boundaries: [0.01, 0.1, 1, 5, 10, 50, 100] }),
      { operation: "production.assert" },
    );
    const safeGraph = { ...unsafeGraph, nodes: [] };
    const program = Effect.gen(function* () {
      yield* assertProductionGraphEffect(safeGraph);
      yield* Effect.flip(assertProductionGraphEffect(unsafeGraph));
      return {
        calls: (yield* Metric.value(operations)).count,
        failures: (yield* Metric.value(failures)).count,
        duration: (yield* Metric.value(duration)).count,
      };
    });
    const values = Effect.runSync(
      Effect.provideService(
        Effect.provide(program, GraphTelemetryLive),
        Metric.MetricRegistry,
        registry,
      ),
    );
    expect(values).toEqual({ calls: 2, failures: 1, duration: 2 });
  });
});
