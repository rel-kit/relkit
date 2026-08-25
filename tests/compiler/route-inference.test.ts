import { describe, expect, test } from "bun:test";
import { normalizeCompilation } from "../../packages/compiler/src/index.ts";
import { defineError, defineFunction } from "../../packages/functions/src/index.ts";
import { defineRoute } from "../../packages/routes/src/index.ts";
import { z } from "../../packages/schema/src/index.ts";

describe("route contract inference", () => {
  test("rejects framework-reserved route paths", () => {
    const target = defineFunction({
      id: "reserved.read",
      input: z.object({}),
      output: z.string(),
      handler: async () => "no",
    });
    const result = compile(target, "GET", "src/routes/_zsys/v1/openapi.json/route.ts");

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "ZSYS_ROUTE_RESERVED_PATH" }),
    );
  });

  test("maps path and remaining GET fields and infers success, errors, and validation", () => {
    const notFound = defineError({
      id: "orders.not-found",
      data: z.object({ orderId: z.string() }),
      message: "Not found",
      retry: "never",
      http: { status: 404 },
    });
    const target = defineFunction({
      id: "orders.read",
      input: z.object({ orderId: z.string(), expand: z.string().optional() }),
      output: z.object({ ok: z.boolean() }),
      errors: [notFound],
      handler: async (input) =>
        input.orderId === "missing" ? new notFound({ orderId: input.orderId }) : { ok: true },
    });
    const result = compile(target, "GET", "src/routes/orders/[orderId]/route.ts");
    const value = routeValue(result);

    expect(value.request).toEqual({
      kind: "input",
      fields: {
        orderId: { kind: "path", name: "orderId" },
        expand: { kind: "optional", value: { kind: "query", name: "expand" } },
      },
    });
    expect(value.responses).toEqual([
      expect.objectContaining({ kind: "success", status: 200 }),
      expect.objectContaining({ kind: "error", errorId: "orders.not-found", status: 404 }),
      expect.objectContaining({ kind: "validation-error", status: 422 }),
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  test("maps only matching path fields and leaves unmatched params on the request", () => {
    const target = defineFunction({
      id: "orders.read",
      input: z.object({ orderId: z.string() }),
      output: z.object({ ok: z.boolean() }),
      handler: async () => ({ ok: true }),
    });
    const result = compile(
      target,
      "GET",
      "src/routes/orders/[orderId]/products/[productId]/route.ts",
    );

    expect(routeValue(result).request).toEqual({
      kind: "input",
      fields: { orderId: { kind: "path", name: "orderId" } },
    });
    expect(result.diagnostics).toEqual([]);
  });

  test("does not infer unmatched catch-all params into reusable input", () => {
    const target = defineFunction({
      id: "docs.read",
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      handler: async () => ({ ok: true }),
    });
    const result = compile(target, "GET", "src/routes/docs/[...parts]/route.ts");

    expect(routeValue(result).request).toEqual({ kind: "input", fields: {} });
    expect(result.diagnostics).toEqual([]);
  });

  test("keeps explicit request mappings as complete overrides", () => {
    const target = defineFunction({
      id: "orders.search",
      input: z.object({ query: z.string() }),
      output: z.object({ ok: z.boolean() }),
      handler: async () => ({ ok: true }),
    });
    const descriptor = defineRoute({
      id: "orders.search.route",
      target,
      request: { kind: "input", fields: { query: { kind: "query", name: "q" } } },
    });
    const result = normalizeCompilation({
      descriptors: [
        target,
        {
          descriptor,
          exportName: "GET",
          exportKind: "named",
          source: { file: "src/routes/orders/[orderId]/route.ts", line: 1, column: 14 },
          reference: {
            generationId: "route-inference-test",
            descriptorId: descriptor.id,
            kind: "route",
            module: "src/routes/orders/[orderId]/route.ts",
            exportName: "GET",
          },
        },
      ],
    });

    expect(routeValue(result).request).toEqual({
      kind: "input",
      fields: { query: { kind: "query", name: "q" } },
    });
    expect(result.diagnostics).toEqual([]);
  });

  test("includes declared errors without explicit HTTP status mappings", () => {
    const invalid = defineError({
      id: "orders.invalid",
      data: z.object({ reason: z.string() }),
      message: "Invalid order",
      retry: "never",
    });
    const unavailable = defineError({
      id: "orders.unavailable",
      data: z.object({ reason: z.string() }),
      message: "Order unavailable",
      retry: "later",
    });
    const target = defineFunction({
      id: "orders.read",
      input: z.object({ kind: z.string() }),
      output: z.object({ ok: z.boolean() }),
      errors: [invalid, unavailable],
      handler: async (input) =>
        input.kind === "invalid"
          ? new invalid({ reason: input.kind })
          : input.kind === "unavailable"
            ? new unavailable({ reason: input.kind })
            : { ok: true },
    });
    const value = routeValue(compile(target, "GET", "src/routes/orders/route.ts"));

    expect(value.responses).toEqual([
      expect.objectContaining({ kind: "success", status: 200 }),
      expect.objectContaining({ kind: "error", errorId: "orders.invalid", status: 500 }),
      expect.objectContaining({ kind: "error", errorId: "orders.unavailable", status: 500 }),
      expect.objectContaining({ kind: "validation-error", status: 422 }),
    ]);
  });

  test("maps write fields to JSON and infers void as 204", () => {
    const target = defineFunction({
      id: "orders.delete",
      input: z.object({ reason: z.string() }),
      output: z.void(),
      handler: async () => undefined,
    });
    const value = routeValue(compile(target, "POST", "src/routes/orders/route.ts"));

    expect(value.request).toEqual({
      kind: "input",
      fields: { reason: { kind: "body", name: "reason" } },
    });
    expect(value.responses).toEqual([
      { kind: "success", id: "success.204", status: 204 },
      { kind: "validation-error", id: "validation.422", status: 422 },
    ]);
  });

  test("maps write fields to multipart when the route accepts form data", () => {
    const file = z.file({ maxBytes: 10 * 1024 * 1024, mediaTypes: ["image/png"] });
    const target = defineFunction({
      id: "assets.upload",
      input: z.object({
        label: z.string(),
        primary: file,
        attachments: z.array(file),
      }),
      output: z.object({ ok: z.boolean() }),
      handler: async () => ({ ok: true }),
    });
    const value = routeValue(
      compile(target, "POST", "src/routes/uploads/route.ts", "multipart/form-data"),
    );

    expect(value.request).toEqual({
      kind: "input",
      fields: {
        attachments: { kind: "multipart-all", name: "attachments" },
        label: { kind: "multipart", name: "label" },
        primary: { kind: "multipart", name: "primary" },
      },
    });
    expect(value.responses).toEqual([
      expect.objectContaining({ kind: "success", status: 200 }),
      expect.objectContaining({ kind: "validation-error", status: 422 }),
    ]);
  });

  test("preserves schema defaults in inferred request mappings", () => {
    const target = defineFunction({
      id: "hello.read",
      input: z.object({ name: z.string().default("world") }),
      output: z.object({ message: z.string() }),
      handler: async () => ({ message: "Hello, world!" }),
    });

    expect(routeValue(compile(target, "GET", "src/routes/hello/route.ts")).request).toEqual({
      kind: "input",
      fields: {
        name: { kind: "default", value: { kind: "query", name: "name" }, default: "world" },
      },
    });
  });

  test("infers catch-all arrays and reports unusable input projections", () => {
    const target = defineFunction({
      id: "files.read",
      input: z.object({ parts: z.array(z.string()) }),
      output: z.object({ ok: z.boolean() }),
      handler: async () => ({ ok: true }),
    });
    const caught = compile(target, "GET", "src/routes/files/[...parts]/route.ts");
    expect(routeValue(caught).request).toEqual({
      kind: "input",
      fields: { parts: { kind: "path-segments", name: "parts" } },
    });

    const scalar = defineFunction({
      id: "scalar.read",
      input: z.string(),
      output: z.string(),
      handler: async (value) => value,
    });
    const invalid = compile(scalar, "GET", "src/routes/[id]/route.ts");
    expect(invalid.diagnostics.map(({ code }) => code)).toContain("ZSYS_MAPPING_INCOMPATIBLE");
    expect(invalid.diagnostics.some(({ message }) => message.includes("explicit request"))).toBe(
      true,
    );
  });
});

function compile(
  target: ReturnType<typeof defineFunction>,
  method: string,
  file: string,
  accept?: "application/json" | "multipart/form-data",
) {
  const descriptor = defineRoute({
    id: `${target.id}.route`,
    target,
    ...(accept === undefined ? {} : { accept }),
  });
  return normalizeCompilation({
    descriptors: [
      target,
      {
        descriptor,
        exportName: method,
        exportKind: "named",
        source: { file, line: 1, column: 14 },
        reference: {
          generationId: "route-inference-test",
          descriptorId: descriptor.id,
          kind: "route",
          module: file,
          exportName: method,
        },
      },
    ],
  });
}

function routeValue(result: ReturnType<typeof normalizeCompilation>): Record<string, any> {
  return result.descriptors.find(({ kind }) => kind === "route")?.value as Record<string, any>;
}
