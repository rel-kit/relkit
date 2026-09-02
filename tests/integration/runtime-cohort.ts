import {
  GENERATOR_VERSION,
  MANIFEST_VERSION,
  RUNTIME_INTEGRATION_PLAN_FILE,
  RUNTIME_INTEGRATION_PLAN_VERSION,
} from "../../packages/contracts/src/index.ts";

export function runtimeCohort(graphHash: string) {
  return {
    contractVersion: MANIFEST_VERSION,
    generatorVersion: GENERATOR_VERSION,
    graphHash,
    activationFingerprint: {
      graphHash,
      manifestHash: "sha256:test-manifest",
      runtimeIntegrationsPlanHash: "sha256:test-runtime-integrations",
    },
    runtimeIntegrationsPlan: {
      version: RUNTIME_INTEGRATION_PLAN_VERSION,
      fileName: RUNTIME_INTEGRATION_PLAN_FILE,
      graphHash,
    },
  } as const;
}
