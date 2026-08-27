import { Effect, Layer, ManagedRuntime } from "effect";
import { describe, expect, test } from "bun:test";
import {
  InvocationTrace,
  captureInvocationTrace,
  createInvocationBridge,
  type SpanLifecycle,
  withChildSpan,
  withRootSpan,
} from "./src/tracing.js";
import { IdSource } from "./src/services.js";

function ids() {
  let next = 0;
  return { next: (kind: string) => `${kind}-${++next}` as never };
}

describe("runtime tracing", () => {
  test("creates correlated root and child invocation spans", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    try {
      const result = await runtime.runPromise(
        Effect.provideService(
          withRootSpan(
            Effect.gen(function* () {
              const root = yield* Effect.service(InvocationTrace);
              const child = yield* withChildSpan(Effect.service(InvocationTrace), {
                name: "child",
                invocationId: "child-invocation",
                source: "direct",
              });
              return { root, child };
            }),
            {
              name: "root",
              invocationId: "root-invocation",
              functionId: "orders.get",
              serviceId: "orders",
              correlationId: "request-1",
              source: "http",
            },
          ),
          IdSource,
          ids(),
        ),
      );

      expect(result.root?.traceId).toBe(result.child?.traceId);
      expect(result.root?.correlationId).toBe("request-1");
      expect(result.root?.functionId).toBe("orders.get");
      expect(result.root?.serviceId).toBe("orders");
      expect(result.child?.serviceId).toBe("orders");
      expect(result.child?.parentInvocationId).toBe("root-invocation");
      expect(result.child?.parentSpanId).toBe(result.root?.spanId);
    } finally {
      await runtime.dispose();
    }
  });

  test("re-enters the active trace through the same caller-owned runtime", async () => {
    const events: SpanLifecycle[] = [];
    const runtime = ManagedRuntime.make(Layer.empty);
    let runnerCalls = 0;
    try {
      const result = await runtime.runPromise(
        Effect.provideService(
          withRootSpan(
            Effect.gen(function* () {
              const captured = yield* captureInvocationTrace;
              const bridge = createInvocationBridge(
                {
                  run: (effect, options) => {
                    runnerCalls += 1;
                    return runtime.runPromise(effect, options);
                  },
                },
                captured,
              );
              return yield* Effect.promise(() =>
                bridge.run(Effect.service(InvocationTrace), { name: "ctx.cache" }),
              );
            }),
            {
              name: "root",
              invocationId: "invoke-1",
              correlationId: "request-1",
              source: "http",
              attributes: { "relkit.test": "trace" },
              observer: (event) => events.push(event),
            },
          ),
          IdSource,
          ids(),
        ),
      );

      expect(runnerCalls).toBe(1);
      expect(result.traceId).toBe("trace-1");
      expect(result.correlationId).toBe("request-1");
      expect(result.invocationId).toBe("invoke-1");
    } finally {
      await runtime.dispose();
    }

    const completed = events.filter((event) => event.type === "completed");
    expect(completed).toHaveLength(2);
    expect(completed.filter((event) => event.span.parent._tag === "None")).toHaveLength(1);
    const root = completed.find((event) => event.span.name === "root");
    const child = completed.find((event) => event.span.name === "ctx.cache");
    expect(root?.span.traceId).toBe(child?.span.traceId);
    expect(child?.span.parent._tag).toBe("Some");
    expect(root?.span.attributes.get("relkit.invocation.id")).toBe("invoke-1");
    expect(child?.span.attributes.get("relkit.correlation.id")).toBe("request-1");
  });
});
