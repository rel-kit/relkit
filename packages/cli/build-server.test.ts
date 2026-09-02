import { expect, test } from "bun:test";
import { GRAPH_VERSION, type RuntimeActivationFingerprint } from "@relkit/contracts";
import { serverSource } from "./src/commands/build-server.ts";

const graphHash = "sha256:graph";
const activationFingerprint: RuntimeActivationFingerprint = {
  graphHash,
  manifestHash: "sha256:manifest",
  runtimeIntegrationsPlanHash: "sha256:runtime-integrations",
};

test("generated runtime carries and verifies its activation fingerprint", () => {
  const source = serverSource(
    { contractVersion: GRAPH_VERSION, appId: "test", nodes: [], edges: [] },
    graphHash,
    activationFingerprint,
  );
  expect(source).toContain(
    `const activationFingerprint = ${JSON.stringify(activationFingerprint)};`,
  );
  expect(source).toContain("Runtime activation fingerprint verification failed.");
  expect(source).toContain("Runtime integration plan fingerprint verification failed.");
  expect(source).toContain("Runtime integration plan version");
  expect(source).toContain("Runtime integration plan does not match the application graph");
  expect(source).toContain('from "./runtime-integrations.ts"');
  expect(source).not.toContain("@relkit/cloud-aws/runtime");
  expect(source).not.toContain("awsProviderFactories");
  expect(source).toContain(
    "runtimeIntegrationModules, bindingValues: sourceValues, localBindingValues",
  );
  expect(source).not.toContain("environmentMetadata:");
  expect(source).not.toContain("providers: { buckets:");
  expect(source).toContain(
    'const telemetryConfiguration = graph.nodes.find((node) => node.kind === "app")?.telemetry;',
  );
  expect(source).toContain("configuration: telemetryConfiguration");
  expect(source).toContain("createTelemetryExporterFanout");
  expect(source).toContain("exporter: telemetryExporters");
  expect(source).toContain("integrations: runtimeIntegrationsPlan");
  expect(source).toContain("counters: telemetry.exportCounters()");
  expect(source).toContain("exporters: telemetry.exporterStats()");
  expect(source).toContain('if (environment === "production") stdoutJsonSink.write(record);');
  expect(source.toLowerCase()).not.toContain("cloudwatch");
  expect(source.match(/writeRuntimeLog\(record\);/g)?.length).toBe(3);
  expect(source.indexOf("assertRuntimeIntegrationModules(")).toBeLessThan(
    source.indexOf("createProviderRegistry("),
  );
  expect(source).not.toContain("Runtime local-service plan fingerprint verification failed.");
  expect(source).not.toContain("RELKIT_PROVIDER_OVERRIDES_FILE");
  expect(source.match(/activationFingerprint/g)?.length).toBeGreaterThanOrEqual(4);
});

test("generated runtime validates activation-bound provider overrides", () => {
  const source = serverSource(
    { contractVersion: GRAPH_VERSION, appId: "test", nodes: [], edges: [] },
    graphHash,
    {
      ...activationFingerprint,
      localServicesPlanHash: "sha256:local-services",
      providerOverridesGeneration: "generation-1",
    },
  );
  expect(source).toContain("providerOverrideBindingValues");
  expect(source).toContain("RELKIT_PROVIDER_OVERRIDES_FILE");
  expect(source).toContain("RELKIT_LOCAL_SERVICE_INSPECTOR_STATE");
  expect(source).toContain("providerOverridesInfo.isSymbolicLink()");
  expect(source).toContain("planHash: activationFingerprint.localServicesPlanHash");
  expect(source).toContain("generationId: activationFingerprint.providerOverridesGeneration");
});

test("generated runtime verifies an optional local-service plan", () => {
  const source = serverSource(
    { contractVersion: GRAPH_VERSION, appId: "test", nodes: [], edges: [] },
    graphHash,
    { ...activationFingerprint, localServicesPlanHash: "sha256:local-services" },
  );
  expect(source).toContain('import localServicesPlan from "./local-services.plan.json"');
  expect(source).toContain("Runtime local-service plan fingerprint verification failed.");
  expect(source).toContain("Runtime local-service plan version");
  expect(source).toContain("Runtime local-service plan does not match the application graph");
});
