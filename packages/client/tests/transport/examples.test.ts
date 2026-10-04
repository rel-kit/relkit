import { expect, it } from "@effect/vitest";
import { Context, Effect, Layer, Logger, ManagedRuntime, Metric, References } from "effect";
import { runExecutionSync } from "@relkit/contracts/operation";
import { acquireClientOwner } from "../../src/client-owner.js";
import { ClientTransport, clientTransportLayer } from "../../src/transport.service.js";
import { PendingOperations, pendingOperationsLayer } from "../../src/react/pending.service.js";
import {
  RealtimeSessions,
  realtimeSessionsLayer,
} from "../../src/react/realtime-session.service.js";

it.effect("executes the documented synchronous acquisition and joined disposal examples", () =>
  Effect.promise(async () => {
    const transport = ManagedRuntime.make(
      clientTransportLayer(Effect.succeed({ call: async () => 1 })),
    );
    try {
      const service = runExecutionSync(transport, ClientTransport);
      expect(await transport.runPromise(service.invoke([], undefined, { context: {} }))).toBe(1);
    } finally {
      await transport.dispose();
    }
    const pending = ManagedRuntime.make(pendingOperationsLayer(new Map()));
    try {
      const digest = await pending.runPromise(
        Effect.flatMap(PendingOperations, (service) => service.digest({ input: 1 })),
      );
      expect(digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    } finally {
      await pending.dispose();
    }
    const realtime = ManagedRuntime.make(realtimeSessionsLayer({}));
    try {
      const service = runExecutionSync(realtime, RealtimeSessions);
      expect(runExecutionSync(realtime, service.snapshot())).toBe("idle");
    } finally {
      await realtime.dispose();
    }
  }),
);

it.effect("owner contexts isolate logger thresholds and metric registries", () =>
  Effect.gen(function* () {
    const visible: unknown[] = [];
    const suppressed: unknown[] = [];
    const firstRegistry: Metric.MetricRegistry = new Map();
    const secondRegistry: Metric.MetricRegistry = new Map();
    const make = (registry: Metric.MetricRegistry, logs: unknown[], minimum: "Info" | "Error") =>
      acquireClientOwner(
        Layer.mergeAll(
          clientTransportLayer(Effect.succeed({ call: async () => "public-value" })),
          Logger.layer([
            Logger.make((options) => {
              logs.push(options);
            }),
          ]),
          Layer.succeed(Metric.MetricRegistry, registry),
          Layer.succeed(References.MinimumLogLevel, minimum),
        ),
        ClientTransport,
      );
    const first = yield* Effect.acquireRelease(
      Effect.sync(() => make(firstRegistry, visible, "Info")),
      (owner) => Effect.promise(() => owner.close()),
    );
    const second = yield* Effect.acquireRelease(
      Effect.sync(() => make(secondRegistry, suppressed, "Error")),
      (owner) => Effect.promise(() => owner.close()),
    );
    yield* Effect.promise(() =>
      first.run(
        first.service.invoke(["private-path"], { token: "private-input" }, { context: {} }),
      ),
    );
    yield* Effect.promise(() => second.run(second.service.invoke([], undefined, { context: {} })));
    expect(visible).toHaveLength(1);
    expect(suppressed).toHaveLength(0);
    const calls = (registry: Metric.MetricRegistry) =>
      [...registry.values()].filter((entry) => entry.id === "relkit_execution_operations_total");
    for (const registry of [firstRegistry, secondRegistry]) {
      expect(calls(registry)).toHaveLength(1);
      expect(calls(registry)[0]?.hooks.get(Context.empty()).count).toBe(1);
      expect(calls(registry)[0]?.attributes).toMatchObject({
        domain: "client",
        operation: "rpc.invoke",
      });
    }
    expect(JSON.stringify(visible)).not.toContain("private-path");
    expect(JSON.stringify(visible)).not.toContain("private-input");
  }).pipe(Effect.scoped),
);
