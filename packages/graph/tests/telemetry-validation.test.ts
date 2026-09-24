import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import { GraphValidationError } from "../src/index.js";
import { failValidation } from "../src/graph-validation-error.js";
import {
  validateTelemetryConfiguration,
  validateTelemetryConfigurationEffect,
} from "../src/telemetry-validation.js";
const exporter = {
  kind: "telemetry-exporter",
  protocolVersion: 1,
  integrationId: "otel",
  adapterId: "otlp",
  configuration: {},
};
const valid = {
  capture: { signals: ["request", "trace"] },
  redaction: { mode: "development-redacted", maxBytes: 1024, redactKeys: ["password"] },
  localRetention: { maxRecords: 100, maxAgeMs: 1000 },
  exportSampling: { traceRate: 0.5, minimumLogLevel: "warn" },
  exporters: { primary: exporter },
};
function message(value: unknown): string {
  const error = Effect.runSync(
    Effect.flip(validateTelemetryConfigurationEffect(value, 0, failValidation)),
  );
  expect(error).toBeInstanceOf(GraphValidationError);
  return error.message;
}
describe("telemetry configuration validation", () => {
  test("accepts omitted and complete configurations", () => {
    expect(
      Effect.runSync(validateTelemetryConfigurationEffect(undefined, 0, failValidation)),
    ).toBeUndefined();
    expect(
      Effect.runSync(validateTelemetryConfigurationEffect(valid, 0, failValidation)),
    ).toBeUndefined();
    expect(() => validateTelemetryConfiguration(valid, 0, failValidation)).not.toThrow();
  });
  test.each([
    [null, ".telemetry is invalid"],
    [{ unknown: true }, "unknown fields"],
    [{ capture: [] }, ".capture is invalid"],
    [{ capture: { signals: ["unknown"] } }, ".capture.signals is invalid"],
    [{ capture: { signals: ["trace"], unknown: true } }, "unknown fields"],
    [{ redaction: { mode: "raw" } }, ".redaction.mode is invalid"],
    [{ redaction: [] }, ".redaction is invalid"],
    [{ redaction: { maxBytes: 0 } }, ".redaction.maxBytes is invalid"],
    [{ redaction: { redactKeys: [""] } }, ".redaction.redactKeys is invalid"],
    [{ localRetention: { maxRecords: 0 } }, ".localRetention is invalid"],
    [{ localRetention: [] }, ".localRetention is invalid"],
    [{ localRetention: { unknown: 1 } }, "unknown fields"],
    [{ exportSampling: { traceRate: 2 } }, ".exportSampling.traceRate is invalid"],
    [{ exportSampling: [] }, ".exportSampling is invalid"],
    [
      { exportSampling: { minimumLogLevel: "verbose" } },
      ".exportSampling.minimumLogLevel is invalid",
    ],
    [{ exporters: { "bad/name": exporter } }, ".exporters.bad/name is invalid"],
    [{ exporters: [] }, ".exporters is invalid"],
    [
      { exporters: { primary: { ...exporter, protocolVersion: 2 } } },
      ".exporters.primary is invalid",
    ],
    [
      { exporters: { primary: { ...exporter, configuration: null } } },
      ".exporters.primary is invalid",
    ],
  ])("rejects invalid telemetry %#", (value, expected) => {
    expect(message(value)).toContain(expected);
    expect(() => validateTelemetryConfiguration(value, 0, failValidation)).toThrow(TypeError);
  });
});
