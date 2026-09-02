export * from "./transport.js";
export * from "./exporter.js";

export const runtimeIntegration = Object.freeze({
  kind: "runtime-integration",
  integrationId: "otlp",
  registrations: Object.freeze([
    { capability: "telemetry", adapterId: "otlp", protocolVersion: 1 },
  ]),
});
