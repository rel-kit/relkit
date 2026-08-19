import { describe, expect, test } from "bun:test";
import { hashGraph } from "../../packages/graph/src/index.ts";
import {
  generateManifest,
  MANIFEST_CODES,
  normalizeCompilation,
} from "../../packages/compiler/src/index.ts";

const graph = { contractVersion: 1, nodes: [], edges: [] } as const;
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
  test("sorts imports and emits one handler, adapter, validator, and provider slot", () => {
    const first = descriptor("function", "orders.get", "src/functions.ts", "get", {
      handler: { $zsys: "function" },
    });
    const second = descriptor("function", "orders.save", "src/functions.ts", "save", {
      handler: { $zsys: "function" },
    });
    const middleware = descriptor("middleware", "orders.auth", undefined, "auth", {
      target: { ref: { kind: "function", id: "orders.get" } },
      request: { kind: "input", fields: {} },
      decision: { kind: "continue" },
    });
    const transform = descriptor("transform", "orders.id", "src/transforms.ts", "id", {
      schema: { $zsys: "schema" },
    });
    const app = descriptor("app", "app", undefined, "app", {
      providers: {
        development: { recipeTag: "local" },
        test: { recipeTag: "test" },
        production: { recipeTag: "aws" },
      },
    });

    const result = generateManifest({
      graph,
      graphHash,
      descriptors: [transform, app, second, middleware, first],
      middleware: [middleware],
      transforms: [transform],
      generatedDirectory: ".zsys/generated",
    });

    expect(result.activatable).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.source).toContain('import * as __zsys_module_0 from "../../src/functions.ts";');
    expect(result.source).toContain('import * as __zsys_module_1 from "../../src/transforms.ts";');
    expect(result.source).toContain(
      'functions: { "orders.get": __zsys_module_0["get"].handler, "orders.save": __zsys_module_0["save"].handler },',
    );
    expect(result.source).toContain('middleware: { "orders.auth": __zsys_middleware_0 },');
    expect(result.source).toContain(
      'requestTransforms: { "orders.id": __zsys_module_1["id"].schema },',
    );
    expect(result.source).toContain(
      'providerFactories = { "aws": { recipeTag: "aws", factory: undefined }, "local": { recipeTag: "local", factory: undefined }, "test": { recipeTag: "test", factory: undefined } } as const;',
    );
    expect(result.source).toContain("providers: providerFactories,");
    expect(result.source).toContain("providerFactories,");
    expect(result.source).toContain(`manifestGraphHash = "${graphHash}"`);
  });

  test("projects provider metadata as safe names and keeps factory slots out of graph data", () => {
    const credential = "zsys-synthetic-credential-8.4";
    const endpoint = "https://zsys-synthetic-endpoint.invalid";
    const app = {
      kind: "app",
      id: "commerce",
      source: { file: "src/app.ts", line: 1, column: 1 },
      exportName: "default",
      exportKind: "default" as const,
      providers: {
        production: {
          metadata: {
            capabilities: ["buckets", "models"],
            profiles: { default: ["buckets", "models"] },
            environment: [{ name: "MODEL_ENDPOINT", type: "url", sensitive: true }],
            configuration: {
              endpoint,
              credential,
              client: { transport: { token: credential } },
              models: { default: { endpoint, apiKey: credential } },
            },
          },
        },
      },
    };
    const result = normalizeCompilation({ descriptors: [app] });
    const graphValue = result.graph;
    const provider = graphValue?.nodes.find((node) => node.kind === "provider");

    expect(result.diagnostics).toEqual([]);
    expect(provider).toMatchObject({
      id: "default",
      profile: "default",
      capabilities: ["buckets", "models"],
      configuration: {
        production: [
          "client",
          "credential",
          "endpoint",
          "models.default.apiKey",
          "models.default.endpoint",
        ],
      },
      environment: ["MODEL_ENDPOINT"],
      source: { file: "src/app.ts", line: 1, column: 1 },
    });
    expect(graphValue).toBeDefined();
    const browserContract = JSON.parse(JSON.stringify(graphValue));
    assertSafeContract(browserContract, [credential, endpoint]);
    expect(result.outputs.manifest).not.toContain(credential);
    expect(result.outputs.manifest).not.toContain(endpoint);
    expect(result.outputs.manifest).toContain("providerFactories");
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

    const mismatch = generateManifest({
      graph,
      graphHash: `${graphHash.slice(0, -1)}0`,
      descriptors: [],
    });
    expect(mismatch.activatable).toBe(false);
    expect(mismatch.source).toBe("");
    expect(mismatch.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      MANIFEST_CODES.mismatch,
    ]);
  });
});

function assertSafeContract(value: unknown, forbidden: readonly string[]): void {
  const seen = new WeakSet<object>();
  walk(value, "", seen, (key, item) => {
    if (typeof item === "string") {
      forbidden.forEach((entry) => expect(item).not.toContain(entry));
    }
    expect(key).not.toBe("handler");
    expect(key).not.toBe("client");
    if (key === "factory") expect(item).toBeUndefined();
  });
}

function walk(
  value: unknown,
  key: string,
  seen: WeakSet<object>,
  visit: (key: string, value: unknown) => void,
): void {
  visit(key, value);
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry) => walk(entry, key, seen, visit));
    return;
  }
  Object.entries(value).forEach(([childKey, childValue]) =>
    walk(childValue, childKey, seen, visit),
  );
}
