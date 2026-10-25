/** Generated-runtime producer queues redact before transport and disclose loss without failing application work. */
import { expect, test } from "bun:test";
import { Effect } from "effect";
import { createObservabilityRuntime } from "@relkit/observability";
import { CliDevCapture, devCaptureLayer } from "../../src/commands/dev-capture.service.js";

test("remote capture reports oversize queue loss and preserves subsequent records", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const capture = yield* CliDevCapture.use((service) => service.acquire(true, {}));
        const runtime = yield* Effect.acquireRelease(
          Effect.promise(() =>
            createObservabilityRuntime({
              remote: {
                url: capture.environment.RELKIT_TELEMETRY_URL!,
                token: capture.environment.RELKIT_TELEMETRY_TOKEN!,
              },
              configuration: {
                capture: { signals: ["log"] },
                redaction: { redactKeys: ["customerEmail"] },
              },
            }),
          ),
          (value) => Effect.promise(() => value.close()),
        );
        const base = {
          version: 2 as const,
          signal: "log" as const,
          timestamp: new Date().toISOString(),
          level: "debug" as const,
          component: "application",
          fields: { customerEmail: "private@example.test" },
        };
        runtime.collect({ ...base, message: "retained" });
        runtime.collect({ ...base, message: "x".repeat(1_048_576) });
        runtime.collect({ ...base, message: "also retained" });
        yield* Effect.promise(() => runtime.flush());
        const response = yield* capture.records(
          new Request("http://localhost/_relkit/bridge/v1/records"),
        );
        const bytes = yield* Effect.promise(() => response.text());
        expect(bytes).not.toContain("private@example.test");
        expect(bytes).toContain("also retained");
        expect(JSON.parse(bytes)).toMatchObject({ incomplete: true, producerDropped: 1 });
        expect(runtime.exportCounters().localStorage.dropped).toBe(1);
      }),
    ).pipe(Effect.provide(devCaptureLayer)),
  );
});
