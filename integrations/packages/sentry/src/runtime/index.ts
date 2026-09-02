export * from "./exporter.js";

export const runtimeIntegration = Object.freeze({
  kind: "runtime-integration",
  integrationId: "sentry",
  registrations: Object.freeze([
    { capability: "telemetry", adapterId: "sentry", protocolVersion: 1 },
  ]),
});
