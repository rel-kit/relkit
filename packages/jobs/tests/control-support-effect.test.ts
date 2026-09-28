import { expect, test } from "vitest";
import { Effect, Layer, Result } from "effect";
import {
  ControlSupportFailure,
  isTerminalEffect,
  isUnknownEffect,
  normalizeCancellationReceiptEffect,
  observerTimeoutEffect,
  requireOperationIdEffect,
  unknownKeyEffect,
} from "../src/control-support.ts";
import { JobsTelemetry } from "../src/jobs-observability.ts";
import type { JobsRuntime } from "../src/runtime.ts";
import type { RunSnapshot } from "@relkit/contracts/jobs";
test("control helpers expose typed failures and observable Effect operations", () => {
  const seen: string[] = [];
  const telemetry = Layer.succeed(
    JobsTelemetry,
    JobsTelemetry.of({
      observe: (operation, effect) => {
        seen.push(operation);
        return effect;
      },
    }),
  );
  expect(
    Effect.runSync(
      Effect.provide(isTerminalEffect({ status: "completed" } as RunSnapshot), telemetry),
    ),
  ).toBe(true);
  const unknown = { outcome: "unknown", operationId: "op-1", idempotencyKey: "key-1" };
  expect(Effect.runSync(Effect.provide(isUnknownEffect(unknown), telemetry))).toBe(true);
  expect(Effect.runSync(Effect.provide(unknownKeyEffect(unknown), telemetry))).toBe("key-1");
  expect(
    Effect.runSync(
      Effect.provide(
        normalizeCancellationReceiptEffect(
          { runId: "run-1", operationId: "op-1", outcome: "requested" },
          "run-1",
          "op-1",
        ),
        telemetry,
      ),
    ),
  ).toMatchObject({ outcome: "requested" });
  const runtime = { capabilities: { limits: { readTimeoutMs: 500 } } } as JobsRuntime;
  expect(Effect.runSync(Effect.provide(observerTimeoutEffect(runtime), telemetry))).toBe(500);
  const invalid = Effect.runSync(
    Effect.result(Effect.provide(requireOperationIdEffect(""), telemetry)),
  );
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) expect(invalid.failure).toBeInstanceOf(ControlSupportFailure);
  expect(seen).toContain("controlSupport.cancelReceipt");
  expect(seen).toContain("controlSupport.operationId");
});
