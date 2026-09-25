import { admitObservabilityRecord, defineTelemetryExporter } from "../src/index.ts";
import type {
  RedactedObservabilityRecord,
  TelemetryExporterFactoryContext,
  TelemetryExporterRuntime,
} from "../src/index.ts";

export function exporter(id: string) {
  return defineTelemetryExporter(id, id, {
    token: {
      kind: "binding-value-ref",
      name: "EXPORT_TOKEN",
      type: "secret-string",
      sensitive: true,
    },
  });
}

export function runtimeModule(
  id: string,
  create: (context: TelemetryExporterFactoryContext) => TelemetryExporterRuntime,
) {
  return {
    module: {
      runtimeIntegration: {
        kind: "runtime-integration",
        integrationId: id,
        registrations: [{ capability: "telemetry", adapterId: id, protocolVersion: 1 }],
      },
      createTelemetryExporter: async (context: TelemetryExporterFactoryContext) => create(context),
    },
  };
}

export function sink(
  exportRecord: TelemetryExporterRuntime["exportRecord"],
): TelemetryExporterRuntime {
  return { exportRecord, flush: () => Promise.resolve(), close: () => Promise.resolve() };
}

export function admitted(): RedactedObservabilityRecord {
  return admitObservabilityRecord({
    version: 2,
    signal: "log",
    timestamp: "2026-09-02T00:00:00.000Z",
    level: "info",
    component: "test",
    message: "safe",
    fields: {},
  })!;
}

export function stats(name: string, healthy: boolean, exported: number, failures: number) {
  return {
    name,
    healthy,
    received: 3,
    selected: 1,
    exported,
    sampledOut: 1,
    severityFiltered: 1,
    failures,
  };
}
