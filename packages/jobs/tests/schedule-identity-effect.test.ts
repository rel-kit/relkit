import { Effect, Layer } from "effect";
import { expect, test } from "vitest";
import { JobsTelemetry } from "../src/jobs-observability.ts";
import {
  scheduleOperationId,
  scheduleOperationIdEffect,
  scheduleOwner,
  scheduleOwnerEffect,
} from "../src/schedule-reconciliation-identity.ts";

test("schedule identity Effects are stable, scoped, and observable", () => {
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
  const options = {
    context: {
      application: "app",
      environment: "test",
      service: "jobs",
      signal: new AbortController().signal,
    },
    jobId: "receipt",
    buildId: "build-1",
  };
  const owner = Effect.runSync(Effect.provide(scheduleOwnerEffect(options), telemetry));
  const operation = Effect.runSync(
    Effect.provide(scheduleOperationIdEffect(options, "hourly"), telemetry),
  );
  expect(owner).toBe(scheduleOwner(options));
  expect(operation).toBe(scheduleOperationId(options, "hourly"));
  expect(scheduleOperationId(options, "daily")).not.toBe(operation);
  expect(scheduleOperationId({ ...options, buildId: "build-2" }, "hourly")).not.toBe(operation);
  expect(seen).toContain("schedule.owner");
  expect(seen).toContain("schedule.operationId");
});
