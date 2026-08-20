import { describe, expect, test } from "bun:test";
import { defineCache } from "../../packages/cache/src/index.ts";
import { normalizeCompilation } from "../../packages/compiler/src/index.ts";
import { defineFunction } from "../../packages/functions/src/index.ts";
import { defineRoute, http } from "../../packages/routes/src/index.ts";
import { z } from "../../packages/schema/src/index.ts";

const target = defineFunction({
  id: "orders.list",
  input: z.object({}),
  output: z.object({ ok: z.boolean() }),
  handler: async () => ({ ok: true }),
});

describe("rate-limit compilation", () => {
  test("projects the policy, shared store, edge, and inferred 429", () => {
    const store = defineCache({
      id: "api-rate-limits",
      key: z.string(),
      value: z.number(),
    });
    const route = defineRoute({
      id: "orders.list.http",
      target,
      rateLimit: {
        limit: 100,
        windowMs: 60_000,
        key: http.header("x-api-key"),
        store,
      },
    });
    const result = normalizeCompilation({
      descriptors: [target, store, extracted(route)],
      mode: "production",
    });
    const node = result.graph?.nodes.find(({ id }) => id === route.id) as any;

    expect(result.diagnostics).toEqual([]);
    expect(node.config.rateLimit).toEqual({
      limit: 100,
      windowMs: 60_000,
      key: { kind: "header", name: "x-api-key" },
      storeId: "api-rate-limits",
    });
    expect(node.config.responses).toContainEqual(
      expect.objectContaining({ id: "rate-limit.429", status: 429 }),
    );
    expect(result.graph?.edges).toContainEqual({
      kind: "uses-cache",
      from: route.id,
      to: store.id,
    });
    expect(result.outputs.client).toContain(
      'ClientResult<429, { "error": "rate-limit"; "retryAfterMs": number }>',
    );
  });

  test("allows generation-local memory only outside production", () => {
    const route = defineRoute({
      id: "orders.local-rate-limit",
      target,
      rateLimit: { limit: 2, windowMs: 1_000, key: http.constant("global") },
    });
    const development = normalizeCompilation({ descriptors: [target, extracted(route)] });
    const production = normalizeCompilation({
      descriptors: [target, extracted(route)],
      mode: "production",
    });

    expect(development.diagnostics).toEqual([]);
    expect(production.diagnostics).toContainEqual(
      expect.objectContaining({ code: "ZSYS_RATE_LIMIT_STORE_REQUIRED" }),
    );
  });
});

function extracted(descriptor: object) {
  const file = "src/routes/orders/route.ts";
  return {
    descriptor,
    exportName: "GET",
    exportKind: "named" as const,
    source: { file, line: 1, column: 14 },
    reference: {
      generationId: "rate-limit-test",
      descriptorId: (descriptor as { id: string }).id,
      kind: "route",
      module: file,
      exportName: "GET",
    },
  };
}
