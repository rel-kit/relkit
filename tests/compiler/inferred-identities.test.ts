import { describe, expect, test } from "bun:test";
import * as ts from "typescript";
import { diffGraph } from "../../packages/graph/src/index.ts";
import { readFacts } from "../../packages/compiler/src/discovery/source-facts.ts";
import {
  NORMALIZE_CODES,
  normalizeCompilation,
  type NormalizedDescriptor,
} from "../../packages/compiler/src/index.ts";
import type { ExtractedDescriptor } from "../../packages/compiler/src/discovery/extract.ts";

const objectSchema = (properties: Record<string, unknown> = {}) => ({
  $relkit: "schema",
  jsonSchema: { type: "object", properties, required: Object.keys(properties) },
});

describe("compiler source identity normalization", () => {
  test("derives IDs and rewrites target references before validation", () => {
    const functionSource =
      "export const getOrder = defineFunction({ input: schema, output: schema, handler: async () => ({}) });";
    const routeSource = "export const GET = defineRoute({ target: getOrder });";
    const targetId = "unbound.target";
    const target = extracted(
      "function",
      targetId,
      "src/orders/functions/get-order.function.ts",
      "getOrder",
      functionSource,
      { input: objectSchema({ orderId: { type: "string" } }), output: objectSchema() },
      1,
    );
    const route = extracted(
      "route",
      "unbound.route",
      "src/routes/orders/[orderId]/route.ts",
      "GET",
      routeSource,
      {
        target: {
          kind: "function",
          id: targetId,
          ref: { kind: "function", id: targetId },
          input: objectSchema({ orderId: { type: "string" } }),
          output: objectSchema(),
        },
      },
      1,
    );

    const result = normalizeCompilation({
      extracted: [target, route],
      projectRoot: "/workspace/app",
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.descriptors.map(({ id }) => id)).toEqual([
      "orders.get-order",
      "route.get.orders.by-order-id",
    ]);
    const normalizedRoute = result.descriptors.find(({ kind }) => kind === "route")!;
    expect((normalizedRoute.value as any).target.ref.id).toBe("orders.get-order");
    expect(normalizedRoute.reference?.descriptorId).toBe("route.get.orders.by-order-id");
    expect(result.references.has("orders.get-order")).toBe(true);
  });

  test("normalizes service member identities used by route targets", () => {
    const serviceSource =
      "export const Orders = defineService({ functions: { getOrder } });\nconst getOrder = defineFunction({ input: schema, output: schema, handler: async () => ({}) });";
    const memberId = "unbound.member";
    const service = extracted(
      "service",
      "unbound.service",
      "src/orders/service.ts",
      "Orders",
      serviceSource,
      {
        functions: {
          getOrder: {
            kind: "function",
            id: memberId,
            ref: { kind: "function", id: memberId },
            input: objectSchema(),
            output: objectSchema(),
          },
        },
      },
      1,
    );
    const route = extracted(
      "route",
      "unbound.route",
      "src/routes/orders/route.ts",
      "GET",
      "export const GET = defineRoute({ target: Orders.getOrder });",
      {
        target: {
          kind: "function",
          id: memberId,
          ref: { kind: "function", id: memberId },
          input: objectSchema(),
          output: objectSchema(),
        },
      },
      1,
    );
    const functionDescriptor = extracted(
      "function",
      memberId,
      "src/orders/functions/get-order.function.ts",
      "getOrder",
      "export const getOrder = defineFunction({ input: schema, output: schema, handler: async () => ({}) });",
      { input: objectSchema(), output: objectSchema() },
      2,
    );

    const result = normalizeCompilation({
      extracted: [service, functionDescriptor, route],
      projectRoot: "/workspace/app",
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.references.has("orders.get-order")).toBe(true);
    const normalizedRoute = result.descriptors.find(({ kind }) => kind === "route")!;
    expect((normalizedRoute.value as any).target.ref.id).toBe("orders.get-order");
  });

  test("reports ambiguous omitted IDs with an explicit-ID suggestion", () => {
    const descriptor = {
      kind: "function",
      id: "unbound.ambiguous",
      ref: { kind: "function", id: "unbound.ambiguous" },
      input: objectSchema(),
      output: objectSchema(),
    };
    const result = normalizeCompilation({ descriptors: [descriptor] });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: NORMALIZE_CODES.identityAmbiguous,
        suggestion: expect.stringContaining("explicit id"),
      }),
    );
  });

  test("reports mixed explicit/inferred collisions at both source locations", () => {
    const source =
      'export const getOrder = defineFunction({ id: "orders.get-order", input: schema, output: schema, handler: async () => ({}) });';
    const inferredSource =
      "export const getOrder = defineFunction({ input: schema, output: schema, handler: async () => ({}) });";
    const explicit = extracted(
      "function",
      "orders.get-order",
      "src/orders/functions/get-order.function.ts",
      "getOrder",
      source,
      { input: objectSchema(), output: objectSchema() },
      1,
    );
    const inferred = extracted(
      "function",
      "unbound.inferred",
      "src/orders/functions/get-order.function.ts",
      "getOrder",
      inferredSource,
      { input: objectSchema(), output: objectSchema() },
      2,
    );
    const result = normalizeCompilation({ extracted: [explicit, inferred] });
    const diagnostic = result.diagnostics.find(({ code }) => code === NORMALIZE_CODES.duplicateId);
    expect(diagnostic).toMatchObject({
      file: "src/orders/functions/get-order.function.ts",
      line: 2,
      suggestion: expect.stringContaining("explicit id"),
      related: [{ file: "src/orders/functions/get-order.function.ts", line: 1 }],
    });
  });

  test("treats inferred source moves as identity changes and explicit moves as metadata-only", () => {
    const inferredBefore = normalizedFunction(
      "unbound.before",
      "src/orders/functions/get-order.function.ts",
    );
    const inferredAfter = normalizedFunction(
      "unbound.after",
      "src/orders/functions/renamed/get-order.function.ts",
    );
    const inferredDiff = diffGraph(inferredBefore.graph!, inferredAfter.graph!);
    expect(inferredDiff.changes.map(({ change }) => change).sort()).toEqual(["added", "removed"]);

    const explicitBefore = normalizedFunction(
      "orders.get-order",
      "src/orders/functions/get-order.function.ts",
    );
    const explicitAfter = normalizedFunction(
      "orders.get-order",
      "src/orders/functions/renamed/get-order.function.ts",
    );
    const explicitDiff = diffGraph(explicitBefore.graph!, explicitAfter.graph!);
    expect(explicitDiff.changes.every(({ change }) => change === "source-moved")).toBe(true);
    expect(
      explicitDiff.changes.every(({ classification }) => classification === "informational"),
    ).toBe(true);
  });
});

function extracted(
  kind: string,
  id: string,
  module: string,
  exportName: string,
  source: string,
  metadata: Record<string, unknown>,
  line: number,
): ExtractedDescriptor {
  const facts = readFacts(ts.createSourceFile(module, source, ts.ScriptTarget.Latest, true));
  const fact = facts.exports.get(exportName);
  return {
    descriptor: { kind, id, ref: { kind, id }, metadata } as any,
    source: { file: module, line, column: 1 },
    exportName,
    exportKind: "named",
    ...(facts === undefined ? {} : { facts }),
    ...(fact === undefined ? {} : { exportFact: fact }),
    reference: { generationId: "test", descriptorId: id, kind, module, exportName },
  };
}

function normalizedFunction(id: string, source: string): ReturnType<typeof normalizeCompilation> {
  const sourceText = id.startsWith("unbound.")
    ? "export const getOrder = defineFunction({ input: schema, output: schema, handler: async () => ({}) });"
    : 'export const getOrder = defineFunction({ id: "orders.get-order", input: schema, output: schema, handler: async () => ({}) });';
  const entry = extracted(
    "function",
    id,
    source,
    "getOrder",
    sourceText,
    { input: objectSchema(), output: objectSchema() },
    1,
  );
  return normalizeCompilation({ extracted: [entry] });
}
