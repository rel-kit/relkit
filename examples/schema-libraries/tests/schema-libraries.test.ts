/** Checks an app whose contracts use Zod 4, ArkType, Valibot and Effect Schema side by side. */
import { createHash } from "node:crypto";
import { expect, test } from "bun:test";
import { invokeFunction } from "@relkit/testing";
import checkStock from "@app/services/orders/functions/check-stock.function.js";
import quoteOrder from "@app/services/orders/functions/quote-order.function.js";
import trackShipment from "@app/services/orders/functions/track-shipment.function.js";

const root = new URL("..", import.meta.url).pathname;
const generated = (file: string) => Bun.file(`${root}.relkit/generated/${file}`);

async function check(): Promise<{ ok: boolean; diagnostics: unknown[] }> {
  const child = Bun.spawn(["bun", "../../packages/cli/dist/bin.js", "check", "--json"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  return JSON.parse(stdout) as { ok: boolean; diagnostics: unknown[] };
}

const first = await check();
const openapiText = await generated("openapi.json").text();
const openapi = JSON.parse(openapiText);
const graph = await generated("application.graph.json").json();
const activation = await generated("runtime-activation.json").json();

test("relkit check passes", () => {
  expect(first.diagnostics).toEqual([]);
  expect(first.ok).toBe(true);
});

test("OpenAPI describes every function's schemas, whichever library made them", () => {
  const body = (path: string) =>
    openapi.paths[path].post.requestBody.content["application/json"].schema;
  const success = (path: string, method = "post") =>
    openapi.paths[path][method].responses["200"].content["application/json"].schema;
  // Zod 4
  expect(body("/quotes").required).toEqual(["quantity", "sku"]);
  expect(success("/quotes").properties.totalCents.type).toBe("integer");
  // ArkType, including its declared error
  expect(body("/stock").properties.quantity).toEqual({ exclusiveMinimum: 0, type: "integer" });
  expect(success("/stock").required).toEqual(["available", "sku"]);
  expect(
    openapi.paths["/stock"].post.responses["409"].content["application/problem+json"].schema.properties.data
      .required,
  ).toEqual(["available", "sku"]);
  // Valibot
  expect(body("/orders").required).toEqual(["quantity", "sku"]);
  expect(success("/orders").properties.orderId).toEqual({ type: "string" });
  // Effect Schema
  expect(
    openapi.paths["/shipments"].get.parameters.map(({ name }: { name: string }) => name),
  ).toEqual(["orderId"]);
  expect(success("/shipments", "get").properties.status.enum).toEqual([
    "pending",
    "shipped",
    "delivered",
  ]);
});

test("the graph holds the event, task and error contracts", () => {
  const node = (kind: string, id: string) =>
    graph.nodes.find(
      (entry: { kind: string; id: string }) => entry.kind === kind && entry.id === id,
    );
  expect(node("event", "orders.placed").input.required).toEqual(["orderId", "quantity", "sku"]);
  expect(node("task", "task.orders.ship-order").input.required).toEqual(["orderId"]);
  expect(node("error", "orders.out-of-stock").data.required).toEqual(["available", "sku"]);
});

test("the build fingerprint includes the installed library versions", async () => {
  const version = async (name: string) =>
    ((await Bun.file(`${root}node_modules/${name}/package.json`).json()) as { version: string })
      .version;
  const libraries = {
    arktype: await version("arktype"),
    effect: await version("effect"),
    valibot: await version("valibot"),
    zod: await version("zod"),
  };
  const expected = `sha256:${createHash("sha256").update(JSON.stringify(libraries)).digest("hex")}`;
  expect(activation.schemaLibrariesHash).toBe(expected);
});

test(
  "a second check produces identical output",
  async () => {
    await check();
    expect(await generated("openapi.json").text()).toBe(openapiText);
    expect(await generated("runtime-activation.json").json()).toEqual(activation);
  },
  { timeout: 120_000 },
);

test("each library validates at runtime", async () => {
  expect(await invokeFunction(quoteOrder, { sku: "pen", quantity: 2 })).toEqual({
    sku: "pen",
    totalCents: 2_500,
  });
  await expect(invokeFunction(quoteOrder, { sku: "", quantity: 2 })).rejects.toThrow();
  await expect(invokeFunction(checkStock, { sku: "sold-out", quantity: 1 })).rejects.toMatchObject({
    code: "orders.out-of-stock",
  });
  expect(await invokeFunction(trackShipment, { orderId: "order-1" })).toEqual({
    orderId: "order-1",
    status: "pending",
  });
});
