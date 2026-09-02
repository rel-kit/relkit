import { expect, test } from "bun:test";
import { defineApp } from "../../packages/app/src/define-app.ts";
import { defineEnv, env } from "../../packages/config/src/index.ts";
import { normalizeCompilation } from "../../packages/compiler/src/index.ts";
import { validateGraphShape } from "../../packages/graph/src/index.ts";
import { otlp } from "../../integrations/packages/otlp/src/index.ts";
import { sentry } from "../../integrations/packages/sentry/src/index.ts";

test("projects typed telemetry and plans all configured exporter integrations", () => {
  const app = defineApp({
    id: "telemetry-app",
    env: defineEnv({}),
    telemetry: {
      capture: { signals: ["request", "log", "trace", "diagnostic"] },
      redaction: { mode: "development-redacted", maxBytes: 1_024 },
      localRetention: { maxRecords: 256, maxBytes: 1_048_576, maxAgeMs: 60_000 },
      exportSampling: { traceRate: 0.1, minimumLogLevel: "warn" },
      exporters: {
        errors: sentry({ dsn: env.secret("SENTRY_DSN") }),
        traces: otlp({
          endpoint: env.url("OTLP_ENDPOINT"),
          headers: { authorization: env.secret("OTLP_AUTHORIZATION") },
        }),
      },
    },
  });
  const result = normalizeCompilation({
    descriptors: [app],
    runtimeIntegrationPackages: [runtimePackage("otlp"), runtimePackage("sentry")],
  });

  expect(result.diagnostics).toEqual([]);
  validateGraphShape(result.graph);
  const application = result.graph?.nodes.find((node) => node.kind === "app");
  expect(application).toMatchObject({
    telemetry: {
      exportSampling: { traceRate: 0.1, minimumLogLevel: "warn" },
      exporters: {
        errors: { integrationId: "sentry", adapterId: "sentry" },
        traces: { integrationId: "otlp", adapterId: "otlp" },
      },
    },
  });
  expect(
    result.graph?.nodes.some(
      (node) => node.kind === "provider" && node.id.includes("observability"),
    ),
  ).toBe(false);
  expect(JSON.parse(result.outputs.runtimeIntegrations).integrations).toEqual([
    planEntry("otlp"),
    planEntry("sentry"),
  ]);
  expect(result.outputs.runtimeIntegrationImports).toContain('from "@relkit/otlp/runtime";');
  expect(result.outputs.runtimeIntegrationImports).toContain('from "@relkit/sentry/runtime";');
  expect(JSON.stringify(result.graph)).not.toContain("top-secret");
});

function runtimePackage(integrationId: "otlp" | "sentry") {
  return {
    integrationId,
    packageName: `@relkit/${integrationId}`,
    packageVersion: "0.1.0",
    exportName: "./runtime",
    registrations: [{ capability: "telemetry", adapterId: integrationId, protocolVersion: 1 }],
  };
}

function planEntry(integrationId: "otlp" | "sentry") {
  return {
    integrationId,
    capability: "telemetry",
    adapterId: integrationId,
    protocolVersion: 1,
    packageName: `@relkit/${integrationId}`,
    packageVersion: "0.1.0",
    exportName: "./runtime",
  };
}
