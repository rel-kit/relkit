import { describe, expect, test } from "bun:test";
import { defineFunction } from "../../packages/functions/src/index.ts";
import { normalizeCompilation } from "../../packages/compiler/src/index.ts";
import { defineRoute, http } from "../../packages/routes/src/index.ts";
import { z } from "../../packages/schema/src/index.ts";

const target = defineFunction({
  id: "orders.read",
  input: z.object({ orderId: z.string() }),
  output: z.object({ ok: z.boolean() }),
  handler: async () => ({ ok: true }),
});

describe("route-file discovery", () => {
  test("binds every named method export to one file-derived path", () => {
    const GET = route("orders.get");
    const PATCH = route("orders.patch");
    const result = normalizeCompilation({
      descriptors: [
        target,
        extracted(GET, "GET", "src/routes/orders/[orderId]/route.ts"),
        extracted(PATCH, "PATCH", "src/routes/orders/[orderId]/route.ts"),
      ],
    });
    const routes = result.descriptors.filter((descriptor) => descriptor.kind === "route");

    expect(routes.map(({ value }) => value)).toEqual([
      expect.objectContaining({
        id: "orders.get",
        method: "GET",
        path: "/orders/:orderId",
        runtimePaths: ["/orders/:orderId"],
      }),
      expect.objectContaining({
        id: "orders.patch",
        method: "PATCH",
        path: "/orders/:orderId",
        runtimePaths: ["/orders/:orderId"],
      }),
    ]);
    expect(result.diagnostics.map(({ code }) => code)).toEqual([]);
  });

  test("reports legacy files, default exports, and transport fields at the route source", () => {
    const legacy = defineRoute({
      id: "orders.legacy",
      method: "GET",
      path: "/orders/:orderId",
      target,
      request: http.input({ orderId: http.path("orderId") }),
      responses: [http.success(200, target.output)],
    } as never);
    const result = normalizeCompilation({
      descriptors: [target, extracted(legacy, "default", "src/routes/orders.route.ts")],
    });

    expect(result.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "RELKIT_ROUTE_FILE_REQUIRED",
        "RELKIT_ROUTE_EXPORT_METHOD",
        "RELKIT_ROUTE_LEGACY_TRANSPORT",
      ]),
    );
    expect(result.diagnostics.every(({ file }) => file === "src/routes/orders.route.ts")).toBe(
      true,
    );
  });

  test("checks collisions across optional catch-all runtime variants", () => {
    const docs = defineFunction({
      id: "docs.read",
      input: z.object({ parts: z.array(z.string()).optional() }),
      output: z.object({ ok: z.boolean() }),
      handler: async () => ({ ok: true }),
    });
    const base = defineRoute({ id: "docs.base", target: docs });
    const catchAll = defineRoute({ id: "docs.catch-all", target: docs });
    const result = normalizeCompilation({
      descriptors: [
        docs,
        extracted(base, "GET", "src/routes/docs/route.ts"),
        extracted(catchAll, "GET", "src/routes/docs/[[...parts]]/route.ts"),
      ],
    });

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "RELKIT_ROUTE_COLLISION",
        message: expect.stringContaining("GET /docs"),
      }),
    );
    expect(result.diagnostics.map(({ code }) => code).includes("RELKIT_PATH_INVALID")).toBe(false);
  });
});

function route(id: string) {
  return defineRoute({
    id,
    target,
    request: http.input({ orderId: http.path("orderId") }),
    responses: [http.success(200, target.output)],
  });
}

function extracted(descriptor: object, exportName: string, file: string) {
  return {
    descriptor,
    exportName,
    exportKind: exportName === "default" ? ("default" as const) : ("named" as const),
    source: { file, line: 4, column: 14 },
    reference: {
      generationId: "route-file-test",
      descriptorId: (descriptor as { id: string }).id,
      kind: "route",
      module: file,
      exportName,
    },
  };
}
