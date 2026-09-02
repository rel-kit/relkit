import { describe, expect, test } from "bun:test";
import { defineApp } from "../../packages/app/src/define-app.ts";
import { defineEnv, env } from "../../packages/config/src/index.ts";
import {
  GRAPH_VERSION,
  MANIFEST_VERSION,
  RUNTIME_INTEGRATION_PLAN_FILE,
  RUNTIME_INTEGRATION_PLAN_VERSION,
} from "../../packages/contracts/src/index.ts";
import { hashGraph } from "../../packages/graph/src/index.ts";
import { redis } from "../../integrations/packages/redis/src/index.ts";
import {
  generateManifest,
  MANIFEST_CODES,
  normalizeCompilation,
} from "../../packages/compiler/src/index.ts";

const graph = { contractVersion: GRAPH_VERSION, nodes: [], edges: [] } as const;
const graphHash = hashGraph(graph);

function descriptor(
  kind: string,
  id: string,
  module: string | undefined,
  exportName: string,
  value: Record<string, unknown> = {},
) {
  return {
    kind,
    id,
    source: { file: module ?? "src/app.ts", line: 1, column: 1 },
    exportName,
    exportKind: exportName === "default" ? ("default" as const) : ("named" as const),
    ...(module === undefined
      ? {}
      : {
          reference: {
            generationId: "generation-test",
            descriptorId: id,
            kind,
            module,
            exportName,
          },
        }),
    value: { kind, id, ...value },
  };
}

describe("runtime manifest generation", () => {
  test("sorts imports and emits handlers plus the runtime-integration plan reference", () => {
    const first = descriptor("function", "orders.get", "src/functions.ts", "get", {
      handler: { $relkit: "function" },
      onBefore: { $relkit: "function" },
      onAfter: { $relkit: "function" },
    });
    const second = descriptor("function", "orders.save", "src/functions.ts", "save", {
      handler: { $relkit: "function" },
    });
    const middleware = descriptor("middleware", "orders.auth", "src/middleware.ts", "auth", {
      path: "/orders/*",
      handler: { $relkit: "function" },
    });
    const transform = descriptor("transform", "orders.id", "src/transforms.ts", "id", {
      schema: { $relkit: "schema" },
    });
    const app = descriptor("app", "app", undefined, "app");

    const result = generateManifest({
      graph,
      graphHash,
      descriptors: [transform, app, second, middleware, first],
      middleware: [middleware],
      transforms: [transform],
      generatedDirectory: ".relkit/generated",
    });

    expect(result.activatable).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.source).toContain('import * as __relkit_module_0 from "../../src/functions.ts";');
    expect(result.source).toContain(
      'import * as __relkit_module_1 from "../../src/middleware.ts";',
    );
    expect(result.source).toContain(
      'import * as __relkit_module_2 from "../../src/transforms.ts";',
    );
    expect(result.source).toContain(
      'functions: { "orders.get": __relkit_module_0["get"].handler, "orders.save": __relkit_module_0["save"].handler },',
    );
    expect(result.source).toContain('middleware: { "orders.auth": __relkit_module_1["auth"] },');
    expect(result.source).toContain(
      'hooks: { "orders.get.after": __relkit_module_0["get"].onAfter, "orders.get.before": __relkit_module_0["get"].onBefore },',
    );
    expect(result.source).toContain(
      'requestTransforms: { "orders.id": __relkit_module_2["id"].schema },',
    );
    expect(result.source).not.toContain("providerFactories");
    expect(result.source).not.toContain("providers:");
    expect(result.source).toContain(
      `runtimeIntegrationsPlanReference = { version: ${RUNTIME_INTEGRATION_PLAN_VERSION}, fileName: "${RUNTIME_INTEGRATION_PLAN_FILE}", graphHash: manifestGraphHash } as const;`,
    );
    expect(result.source).toContain("runtimeIntegrationsPlan: runtimeIntegrationsPlanReference,");
    expect(result.source).toContain(
      'import runtimeActivationFingerprint from "./runtime-activation.json"',
    );
    expect(result.source).toContain("activationFingerprint: runtimeActivationFingerprint,");
    expect(result.source).toContain(
      `export const manifestContractVersion = ${MANIFEST_VERSION} as const;`,
    );
    expect(result.source).toContain("contractVersion: manifestContractVersion,");
    expect(result.source).toContain(`manifestGraphHash = "${graphHash}"`);
  });

  test("keeps provider topology in graph data and factories out of executable manifest", () => {
    const app = defineApp({
      id: "commerce",
      env: defineEnv({}),
      cache: redis({ url: env.secret("CACHE_URL") }),
    });
    const result = normalizeCompilation({ descriptors: [app] });
    const graphValue = result.graph;
    const provider = graphValue?.nodes.find((node) => node.kind === "provider");

    expect(result.diagnostics).toEqual([]);
    expect(provider).toMatchObject({
      id: "provider.cache.default",
      profile: "default",
      capability: "cache",
      adapter: { integrationId: "redis", adapterId: "redis", connection: {} },
      providerSource: { kind: "connected" },
      namedValues: [{ field: "url", name: "CACHE_URL", type: "secret-string", sensitive: true }],
    });
    expect(graphValue).toBeDefined();
    expect(result.outputs.manifest).not.toContain("providerFactories");
    expect(result.outputs.manifest).not.toContain("factory:");
    expect(result.outputs.manifest).toContain("runtimeIntegrationsPlanReference");
    expect(JSON.parse(result.outputs.runtimeIntegrations)).toEqual({
      graphHash: result.graphHash,
      integrations: [],
      version: 1,
    });
    expect(JSON.parse(result.outputs.runtimeActivation)).toMatchObject({
      graphHash: result.graphHash,
      manifestHash: expect.stringMatching(/^sha256:/),
      runtimeIntegrationsPlanHash: expect.stringMatching(/^sha256:/),
    });
  });

  test("does not activate without executable references or with a hash mismatch", () => {
    const missing = generateManifest({
      graphHash,
      descriptors: [descriptor("function", "orders.get", undefined, "get")],
    });
    expect(missing.activatable).toBe(false);
    expect(missing.source).toBe("");
    expect(missing.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      MANIFEST_CODES.handler,
    ]);

    const mismatchHash = `${graphHash.slice(0, -1)}${graphHash.endsWith("0") ? "1" : "0"}`;
    const mismatch = generateManifest({
      graph,
      graphHash: mismatchHash,
      descriptors: [],
    });
    expect(mismatch.activatable).toBe(false);
    expect(mismatch.source).toBe("");
    expect(mismatch.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      MANIFEST_CODES.mismatch,
    ]);
  });
});
