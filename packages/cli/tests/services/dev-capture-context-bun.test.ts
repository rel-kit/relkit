/** Native producer callbacks retain their owning logger, correlation and metric registry. */
import { expect, test } from "bun:test";
import { Effect, Metric } from "effect";
import { createLoggerLayer } from "@relkit/runtime-effect";
import type { LogRecord } from "@relkit/observability";
import { CliDevCapture, devCaptureLayer } from "../../src/commands/dev-capture.service.js";

test("one native ingress operation uses the acquired instrumentation context", async () => {
  const logs: LogRecord[] = [];
  const registry: Metric.MetricRegistry = new Map();
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const capture = yield* CliDevCapture.use((service) => service.acquire(true, {})).pipe(
          Effect.provide(
            createLoggerLayer({ human: false, json: { write: (record) => logs.push(record) } }),
          ),
          Effect.provideService(Metric.MetricRegistry, registry),
          Effect.annotateLogs({ correlationId: "capture-session-test" }),
        );
        const response = yield* Effect.promise(() =>
          fetch(`${capture.environment.RELKIT_TELEMETRY_URL}/records`, {
            method: "POST",
            headers: {
              authorization: `Bearer ${capture.environment.RELKIT_TELEMETRY_TOKEN}`,
              "content-type": "application/json",
            },
            body: '{"records":[]}',
          }),
        );
        expect(response.status).toBe(200);
        yield* Effect.promise(() => response.text());
        const calls = [...registry.values()].filter(
          (entry) =>
            entry.id === "relkit_execution_operations_total" &&
            entry.attributes?.operation === "capture.ingress",
        );
        expect(calls).toHaveLength(1);
        const ingress = logs.filter((record) => record.fields.operation === "capture.ingress");
        expect(ingress).toHaveLength(1);
        expect(ingress[0]?.correlationId).toBe("capture-session-test");
        expect(ingress[0]?.fields.outcome).toBe("success");
      }),
    ).pipe(Effect.provide(devCaptureLayer)),
  );
});
