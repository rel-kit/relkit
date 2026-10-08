import { Schema } from "effect";
import { isTelemetryExporterDescriptor } from "@relkit/observability";

/** Owner-validated static exporter identity, preserved without reconstructing native metadata. */
const exporter = Schema.declare(isTelemetryExporterDescriptor);
/** Telemetry shape before the configuration owner's exact semantic validation. */
export const telemetryConfigurationSchema = Schema.Struct({
  capture: Schema.optionalKey(
    Schema.Struct({
      signals: Schema.optionalKey(
        Schema.Array(
          Schema.Literals([
            "request",
            "invocation",
            "job",
            "event",
            "operation",
            "tool",
            "agent",
            "log",
            "span",
            "trace",
            "diagnostic",
            "generation",
          ]),
        ),
      ),
    }),
  ),
  redaction: Schema.optionalKey(
    Schema.Struct({
      mode: Schema.optionalKey(Schema.Literals(["off", "development-redacted"])),
      maxBytes: Schema.optionalKey(Schema.Number),
      redactKeys: Schema.optionalKey(Schema.Array(Schema.String)),
    }),
  ),
  localRetention: Schema.optionalKey(
    Schema.Struct({
      maxRecords: Schema.optionalKey(Schema.Number),
      maxAgeMs: Schema.optionalKey(Schema.Number),
      maxBytes: Schema.optionalKey(Schema.Number),
      maxEntries: Schema.optionalKey(Schema.Number),
    }),
  ),
  exportSampling: Schema.optionalKey(
    Schema.Struct({
      traceRate: Schema.optionalKey(Schema.Number),
      minimumLogLevel: Schema.optionalKey(
        Schema.Literals(["trace", "debug", "info", "warn", "error", "fatal"]),
      ),
    }),
  ),
  exporters: Schema.optionalKey(Schema.Record(Schema.String, exporter)),
});
