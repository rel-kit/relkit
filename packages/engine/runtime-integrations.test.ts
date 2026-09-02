import { expect, test } from "bun:test";
import type { RuntimeIntegrationPlan } from "@relkit/contracts";
import {
  assertRuntimeIntegrationModules,
  RuntimeIntegrationMetadataError,
} from "./src/runtime-integrations.ts";

const plan: RuntimeIntegrationPlan = {
  version: 1,
  graphHash: "sha256:graph",
  integrations: [
    {
      integrationId: "redis",
      capability: "cache",
      adapterId: "redis",
      protocolVersion: 1,
      packageName: "@relkit/redis",
      packageVersion: "0.1.0",
      exportName: "./runtime",
    },
  ],
};

const loaded = {
  packageName: "@relkit/redis",
  packageVersion: "0.1.0",
  exportName: "./runtime",
  module: {
    runtimeIntegration: {
      kind: "runtime-integration",
      integrationId: "redis",
      registrations: [{ capability: "cache", adapterId: "redis", protocolVersion: 1 }],
    },
  },
};

test("verifies loaded runtime integration identity before construction", () => {
  expect(() => assertRuntimeIntegrationModules(plan, [loaded])).not.toThrow();
  for (const candidate of [
    { ...loaded, module: {} },
    {
      ...loaded,
      module: {
        runtimeIntegration: { ...loaded.module.runtimeIntegration, integrationId: "other" },
      },
    },
    {
      ...loaded,
      module: {
        runtimeIntegration: { ...loaded.module.runtimeIntegration, registrations: [] },
      },
    },
  ]) {
    expect(() => assertRuntimeIntegrationModules(plan, [candidate])).toThrow(
      expect.objectContaining({
        code: "RELKIT_RUNTIME_INTEGRATION_METADATA_INVALID",
        message: expect.stringContaining("Rebuild with `relkit build`"),
      }) as RuntimeIntegrationMetadataError,
    );
  }
});
