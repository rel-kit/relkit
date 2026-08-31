import { describe, expect, test } from "bun:test";
import { defineFunction } from "../../packages/functions/src/index.ts";
import { defineAgent } from "../../packages/agents/src/index.ts";
import { defineBucket } from "../../packages/buckets/src/index.ts";
import { defineRoute, defineTransform, http } from "../../packages/routes/src/index.ts";
import { z, type StandardSchemaV1 } from "../../packages/schema/src/index.ts";
import { NORMALIZE_CODES, normalizeCompilation } from "../../packages/compiler/src/index.ts";

const input = z.object({ id: z.string() });
const output = z.object({ ok: z.boolean() });

function codes(result: ReturnType<typeof normalizeCompilation>): readonly string[] {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

describe("compiler semantic validation", () => {
  test("resolves configured agent model selectors without storing live values", () => {
    const app = (modelProviders: Record<string, unknown>) => ({
      kind: "app",
      id: "app",
      ref: { kind: "app", id: "app" },
      models: {
        default: {
          kind: "provider-binding",
          ownership: "external",
          adapter: { adapter: "ai-sdk", configuration: modelProviders },
        },
      },
    });
    const agent = (model?: string) =>
      defineAgent({
        id: "support.agent",
        input: z.string(),
        output: z.string(),
        ...(model === undefined ? {} : { model }),
        instructions: "Answer safely.",
        tools: [],
        limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 1_000 },
      });
    const configuration = {
      defaultProvider: "openai",
      defaultModel: "gpt-5-mini",
      openai: {},
      anthropic: { defaultModel: "claude-sonnet-4-5" },
    };
    expect(codes(normalizeCompilation({ descriptors: [app(configuration), agent()] }))).not.toEqual(
      expect.arrayContaining([
        NORMALIZE_CODES.modelProvider,
        NORMALIZE_CODES.modelDefault,
        NORMALIZE_CODES.modelConfiguration,
      ]),
    );
    expect(
      codes(normalizeCompilation({ descriptors: [app(configuration), agent("missing")] })),
    ).toContain(NORMALIZE_CODES.modelProvider);
    expect(
      codes(normalizeCompilation({ descriptors: [app(configuration), agent("anthropic")] })),
    ).not.toContain(NORMALIZE_CODES.modelDefault);
    expect(
      codes(normalizeCompilation({ descriptors: [app(configuration), agent("openai:gpt-4.1")] })),
    ).not.toContain(NORMALIZE_CODES.modelProvider);
  });

  test("indexes middleware and transforms without duplicating exported references", () => {
    const target = defineFunction({
      id: "orders.get",
      input,
      output,
      handler: async () => ({ ok: true }),
    });
    const transform = defineTransform({ id: "orders.id", schema: z.string() });
    const middleware = {
      kind: "middleware",
      id: "orders.auth",
      ref: { kind: "middleware", id: "orders.auth" },
      path: "/orders/*",
      handler: async () => undefined,
    };
    const route = defineRoute({
      id: "orders.route",
      method: "GET",
      path: "/orders/:id",
      target,
      request: http.input({ id: http.transform(transform, http.path("id")) }),
      responses: [http.success(200, output)],
    });

    const result = normalizeCompilation({ descriptors: [target, transform, middleware, route] });

    expect(result.diagnostics).toEqual([]);
    expect(result.references.get("orders.auth")?.kind).toBe("middleware");
    expect(result.references.get("orders.id")?.kind).toBe("transform");
  });

  test("reports missing references, response incompatibility, and transform collisions", () => {
    const missing = normalizeCompilation({
      descriptors: [
        {
          kind: "route",
          id: "missing.route",
          method: "GET",
          path: "/missing/:id",
          target: { ref: { kind: "function", id: "missing.function" } },
          request: http.input({ id: http.transform("missing.transform", http.path("id")) }),
          responses: [http.success(200, output)],
        },
      ],
    });
    expect(codes(missing)).toEqual(
      expect.arrayContaining([NORMALIZE_CODES.missingTarget, NORMALIZE_CODES.missingTransform]),
    );

    const target = defineFunction({
      id: "orders.target",
      input,
      output,
      handler: async () => ({ ok: true }),
    });
    const badRoute = defineRoute({
      id: "orders.bad-route",
      method: "GET",
      path: "/orders",
      target,
      request: http.input({ id: http.query("id") }),
      responses: [http.success(200, z.string())],
    });
    const incompatible = normalizeCompilation({ descriptors: [target, badRoute] });
    expect(codes(incompatible)).toContain(NORMALIZE_CODES.response);

    const first = defineTransform({ id: "orders.same", schema: z.string() });
    const second = defineTransform({ id: "orders.same", schema: z.number() });
    expect(codes(normalizeCompilation({ descriptors: [first, second] }))).toContain(
      NORMALIZE_CODES.transformCollision,
    );
  });

  test("validates provider capabilities without static function cycles", () => {
    const target = defineFunction({
      id: "events.target",
      input,
      output,
      handler: async () => ({ ok: true }),
    });
    const app = {
      kind: "app",
      id: "app",
      ref: { kind: "app", id: "app" },
      buckets: {
        archive: {
          kind: "provider-binding",
          ownership: "external",
          adapter: { adapter: "s3", configuration: {} },
        },
      },
    };
    const cache = {
      kind: "cache",
      id: "orders.cache",
      ref: { kind: "cache", id: "orders.cache" },
      profile: "archive",
      key: z.string(),
      value: z.string(),
    };
    const result = normalizeCompilation({
      descriptors: [app, cache, target],
    });
    expect(codes(result)).toEqual(expect.arrayContaining([NORMALIZE_CODES.providerProfile]));
  });

  test("rejects multiple bucket descriptors owning one profile", () => {
    const app = {
      kind: "app",
      id: "app",
      ref: { kind: "app", id: "app" },
      buckets: {
        default: {
          kind: "provider-binding",
          ownership: "managed",
          adapter: { adapter: "s3", configuration: {} },
        },
      },
    };
    const first = defineBucket({ id: "assets.primary", profile: "default", visibility: "private" });
    const second = defineBucket({
      id: "assets.secondary",
      profile: "default",
      visibility: "private",
    });
    const result = normalizeCompilation({ descriptors: [app, first, second] });

    expect(codes(result)).toContain(NORMALIZE_CODES.bucketProfileDuplicate);
    expect(
      result.diagnostics.find(
        (diagnostic) => diagnostic.code === NORMALIZE_CODES.bucketProfileDuplicate,
      ),
    ).toMatchObject({ descriptorId: "assets.secondary" });
  });

  test("projects provider bindings with capability, adapter, ownership, and references", () => {
    const app = {
      kind: "app",
      id: "app",
      ref: { kind: "app", id: "app" },
      buckets: {
        assets: {
          kind: "provider-binding",
          ownership: "external",
          adapter: {
            adapter: "s3",
            configuration: {
              endpoint: {
                kind: "env-ref",
                name: "BUCKET_ENDPOINT",
                type: "url",
                sensitive: false,
                metadata: { type: "url", sensitive: false },
              },
            },
            environment: [{ name: "BUCKET_ENDPOINT", type: "url", sensitive: false }],
          },
        },
      },
    };
    const bucket = defineBucket({ id: "assets", profile: "assets", visibility: "private" });
    const result = normalizeCompilation({ descriptors: [app, bucket] });

    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.nodes.find((node) => node.id === "provider.buckets.assets")).toMatchObject(
      {
        kind: "provider",
        capability: "buckets",
        profile: "assets",
        adapter: "s3",
        ownership: "external",
        configuration: {
          endpoint: {
            kind: "env-ref",
            name: "BUCKET_ENDPOINT",
            type: "url",
            sensitive: false,
          },
        },
      },
    );
    expect(result.graph?.edges).toContainEqual({
      kind: "uses-provider-profile",
      from: "assets",
      to: "provider.buckets.assets",
    });
  });
});
