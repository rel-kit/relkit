import { expect, test } from "bun:test";
import { generateManifest, type NormalizedDescriptor } from "../../packages/compiler/src/index.ts";

const schema = { $zsys: "schema", jsonSchema: { type: "object" } };

test("manifest binds exported service facades and nested errors to canonical IDs", () => {
  const error = {
    kind: "error",
    id: "orders.InvalidError",
    ref: { kind: "error", id: "orders.InvalidError" },
    data: schema,
  };
  const member = {
    kind: "function",
    id: "orders.get-order",
    ref: { kind: "function", id: "orders.get-order" },
    input: schema,
    output: schema,
    errors: [error],
  };
  const service: NormalizedDescriptor = {
    kind: "service",
    id: "orders",
    source: { file: "src/services/orders.service.ts", line: 1, column: 1 },
    exportName: "Orders",
    exportKind: "named",
    reference: {
      generationId: "test",
      descriptorId: "orders",
      kind: "service",
      module: "src/services/orders.service.ts",
      exportName: "Orders",
    },
    value: {
      kind: "service",
      id: "orders",
      ref: { kind: "service", id: "orders" },
      functions: { getOrder: member },
      getOrder: member,
    },
  };
  const tool: NormalizedDescriptor = {
    kind: "tool",
    id: "orders.get-order.tool",
    source: { file: "src/tools/orders.tool.ts", line: 1, column: 1 },
    exportName: "OrderTool",
    exportKind: "named",
    reference: {
      generationId: "test",
      descriptorId: "orders.get-order.tool",
      kind: "tool",
      module: "src/tools/orders.tool.ts",
      exportName: "OrderTool",
    },
    value: {
      kind: "tool",
      id: "orders.get-order.tool",
      ref: { kind: "tool", id: "orders.get-order.tool" },
      target: { ref: { kind: "function", id: "orders.get-order" }, input: schema, output: schema },
    },
  };

  const manifest = generateManifest({
    graphHash: "sha256:test",
    descriptors: [service, tool],
    projectRoot: "/workspace/app",
  });

  expect(manifest.activatable).toBe(true);
  expect(manifest.source).toContain(
    '__zsys_bindDescriptorIdentity(__zsys_module_0["Orders"], "orders");',
  );
  expect(manifest.source).toContain(
    '__zsys_bindDescriptorIdentity(__zsys_module_0["Orders"]["functions"]["getOrder"], "orders.get-order");',
  );
  expect(manifest.source).toContain(
    '__zsys_bindDescriptorIdentity(__zsys_module_0["Orders"]["functions"]["getOrder"]["errors"][0], "orders.InvalidError");',
  );
  expect(manifest.source).toContain(
    '__zsys_bindDescriptorIdentity(__zsys_module_1["OrderTool"]["target"], "orders.get-order");',
  );
  expect(manifest.source).toContain('services: { "orders": __zsys_module_0["Orders"] }');
});
