import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GRAPH_VERSION } from "@relkit/contracts";
import type { ApplicationGraph, ProviderBindingNode } from "@relkit/graph";
import { createTestCacheFake } from "./src/cache.ts";
import { createTestFakes } from "./src/fakes.ts";
import {
  activateTestProviders,
  copyTestProviderReplacements,
} from "./src/provider-replacements.ts";

const source = { file: "src/app.ts", line: 1, column: 1 } as const;

test("applies a cache profile replacement through the production registry", async () => {
  const root = mkdtempSync(join(tmpdir(), "relkit-provider-replacement-"));
  const fakes = createTestFakes(root);
  const replacement = createTestCacheFake({ cacheId: "requests" });
  const registry = await activateTestProviders(
    artifacts(),
    copyTestProviderReplacements({ cache: { requests: replacement } }),
    undefined,
    fakes,
  );
  try {
    expect(fakes.clients.cache?.prices).toBe(replacement.provider);
    expect(registry?.resolve("cache", "requests").value).toBe(replacement.provider);
  } finally {
    await registry?.release();
    rmSync(root, { recursive: true, force: true });
  }
});

test("does not invent a fake for an unreplaced required profile", async () => {
  const root = mkdtempSync(join(tmpdir(), "relkit-provider-missing-"));
  try {
    await expect(
      activateTestProviders(artifacts(), {}, undefined, createTestFakes(root)),
    ).rejects.toMatchObject({ code: "RELKIT_PROVIDER_INTEGRATION_MISSING" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function artifacts() {
  return {
    graph: graph(),
    registry: {} as never,
    runtimeIntegrationModules: [],
  };
}

function graph(): ApplicationGraph {
  const binding: ProviderBindingNode = {
    kind: "provider",
    id: "provider.cache.requests",
    source,
    capability: "cache",
    profile: "requests",
    adapter: {
      integrationId: "redis",
      adapterId: "redis",
      protocolVersion: 1,
      behavior: {},
      connectionContract: {},
      connection: {},
      features: [],
    },
    providerSource: { kind: "connected" },
    namedValues: [],
    deploymentRoles: [],
  };
  return {
    contractVersion: GRAPH_VERSION,
    appId: "testing-replacements",
    nodes: [
      binding,
      {
        kind: "cache",
        id: "prices",
        source,
        key: null,
        value: null,
        profile: "requests",
      },
    ],
    edges: [{ kind: "uses-provider-profile", from: "prices", to: binding.id }],
  };
}
