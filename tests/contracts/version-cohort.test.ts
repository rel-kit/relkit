import { expect, test } from "bun:test";
import {
  CONTRACT_VERSION,
  GENERATOR_VERSION,
  GRAPH_VERSION,
  MANIFEST_VERSION,
  RUNTIME_INTEGRATION_PLAN_FILE,
  RUNTIME_INTEGRATION_PLAN_VERSION,
  assertRuntimeIntegrationPlanVersion,
  type RuntimeIntegrationPlan,
  type RuntimeIntegrationPlanReference,
} from "../../packages/contracts/src/index.ts";
import { DEPLOYMENT_PLAN_VERSION } from "../../packages/deploy/src/index.ts";
import {
  LOCAL_SERVICE_PLAN_VERSION,
  PROVIDER_OVERRIDE_STATE_VERSION,
  type ProviderOverrideState,
} from "../../packages/local-service/src/index.ts";
import { PROVIDER_PROTOCOL_VERSION } from "../../packages/provider/src/index.ts";

test("exposes the provider-architecture contract cohort", () => {
  expect({
    public: CONTRACT_VERSION,
    generator: GENERATOR_VERSION,
    graph: GRAPH_VERSION,
    manifest: MANIFEST_VERSION,
    deployment: DEPLOYMENT_PLAN_VERSION,
    provider: PROVIDER_PROTOCOL_VERSION,
    runtimeIntegration: RUNTIME_INTEGRATION_PLAN_VERSION,
    localService: LOCAL_SERVICE_PLAN_VERSION,
    providerOverride: PROVIDER_OVERRIDE_STATE_VERSION,
  }).toEqual({
    public: 5,
    generator: 5,
    graph: 8,
    manifest: 8,
    deployment: 3,
    provider: 1,
    runtimeIntegration: 1,
    localService: 1,
    providerOverride: 1,
  });
});

test("keeps runtime integration and provider override contracts JSON-safe", () => {
  const runtime = {
    version: RUNTIME_INTEGRATION_PLAN_VERSION,
    graphHash: "sha256:graph",
    integrations: [
      {
        integrationId: "redis",
        capability: "cache",
        adapterId: "redis",
        protocolVersion: PROVIDER_PROTOCOL_VERSION,
        packageName: "@relkit/redis",
        packageVersion: "0.2.0",
        exportName: "./runtime",
      },
    ],
  } satisfies RuntimeIntegrationPlan;
  const reference = {
    version: RUNTIME_INTEGRATION_PLAN_VERSION,
    fileName: RUNTIME_INTEGRATION_PLAN_FILE,
    graphHash: runtime.graphHash,
  } satisfies RuntimeIntegrationPlanReference;
  const overrides = {
    version: PROVIDER_OVERRIDE_STATE_VERSION,
    applicationId: "commerce",
    localProjectId: "sha256:project",
    planHash: "sha256:local-plan",
    generationId: "generation.local-1",
    bindings: [{ bindingId: "cache.requests", values: { url: "redis://127.0.0.1:6379" } }],
  } satisfies ProviderOverrideState;

  expect(JSON.parse(JSON.stringify(runtime))).toEqual(runtime);
  expect(JSON.parse(JSON.stringify(reference))).toEqual(reference);
  expect(JSON.parse(JSON.stringify(overrides))).toEqual(overrides);
});

test("rejects a previous runtime-integration plan without a compatibility reader", () => {
  expect(() => assertRuntimeIntegrationPlanVersion({ version: 0 })).toThrow(
    expect.objectContaining({
      code: "RELKIT_RUNTIME_INTEGRATION_PLAN_VERSION_UNSUPPORTED",
      message: expect.stringContaining("Regenerate with `relkit check`"),
    }),
  );
});
