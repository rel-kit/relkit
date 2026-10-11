/**
 * Emits the telemetry portion of an accepted server cohort.
 * This pure fragment acquires no resources; generated code delegates ownership
 * and expected runtime failures to the existing typed server host.
 */

export const SERVER_TELEMETRY_SOURCE = `try {
const telemetryConfiguration = graph.nodes.find((node) => node.kind === "app")?.telemetry;
assertRuntimeIntegrationModules(runtimeIntegrationsPlan, runtimeIntegrationModules);
const telemetryExporters = await runtimeOwner.resource("telemetry.exporters", (signal) => createTelemetryExporterFanout({ exporters: telemetryConfiguration?.exporters, modules: runtimeIntegrationModules, values: sourceValues, signal }), (value) => value.close(), undefined, "telemetry");
telemetry = await runtimeOwner.resource("telemetry", () => createObservabilityRuntime({ root: process.env.RELKIT_OBSERVABILITY_ROOT ?? ".relkit/observability", configuration: telemetryConfiguration, exporter: telemetryExporters,
  ...(environment !== "production" && process.env.RELKIT_TELEMETRY_URL && process.env.RELKIT_TELEMETRY_TOKEN ? {
    remote: { url: process.env.RELKIT_TELEMETRY_URL, token: process.env.RELKIT_TELEMETRY_TOKEN }
  } : {}) }), (value) => value.close(), undefined, "telemetry");
runtimeWrite = writeRuntimeLog;
runtimeReport = (failure, cleanup) => {
  const operation = failure.operation;
  const component = operation.startsWith("telemetry") ? "telemetry" : operation.startsWith("database") ? "database" : operation.startsWith("auth") ? "auth" : operation === "native-job-worker" ? "native-job-worker" : operation.startsWith("native-job") ? "native-job-registration" : operation.startsWith("job-worker") ? "job-worker" : operation.startsWith("provider") ? "provider" : "lifecycle";
  const labels = { provider: "Provider", database: "Database", auth: "Auth", telemetry: "Telemetry", "native-job-registration": "Native jobs worker registration", "native-job-worker": "Native jobs worker", "job-worker": "Job worker", lifecycle: "Runtime" };
  const suffix = cleanup ? " cleanup failed" : component.endsWith("worker") || component === "native-job-registration" ? " failed" : " startup failed";
  recordRuntimeFailure("runtime." + component, labels[component] + suffix, failure.cause, component === "auth" ? "http" : component.includes("job") ? "job" : "direct");
};
globalThis["__relkit_flush_telemetry"] = telemetry.flush;
const spanRuntime = createHttpSpanRuntime({ generationId, graphHash, observability: telemetry });
`;
