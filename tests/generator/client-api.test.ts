import { expect, test } from "bun:test";
import { clientApiPaths } from "relkit/contracts";
import {
  generateClient,
  generateClientContractDocument,
  generateClientRegistry,
  generateClientRegistryFromDocument,
} from "../../packages/cli/src/client-generator/index.ts";
import { clientApiGraph } from "./client-api.fixture.ts";

test("the generated client exports the api object", () => {
  expect(generateClient(clientApiGraph())).toMatchSnapshot();
});

test("the generated registry types an api object that mirrors services and routes", () => {
  const registry = generateClientRegistry(clientApiGraph());
  expect(registry).toMatchSnapshot();
  expect(registry).toContain('declare module "@relkit/client" {');
  expect(registry).toContain('readonly "priceOrder": import("@relkit/client").ApiRoute<');
  expect(registry).not.toContain('"GET /orders"');
});

test("a pulled contract document renders the same api tree", () => {
  const graph = clientApiGraph();
  const fromGraph = generateClientRegistry(graph);
  const fromDocument = generateClientRegistryFromDocument(
    JSON.parse(generateClientContractDocument(graph, "sha256:test")),
  );
  const tree = (source: string) =>
    source.slice(source.indexOf("interface ClientApi"), source.indexOf("}\n}\n"));
  const names = (source: string) =>
    [...tree(source).matchAll(/readonly "([^"]+)"/g)].map((m) => m[1]);
  expect(names(fromDocument)).toEqual(names(fromGraph));
  expect(fromDocument).toContain(
    'import("@relkit/client").RelkitDeclaredError<"orders.payment-declined", 402, { "reason": string }>',
  );
});

test("routes that share a target get distinct, stable names", () => {
  const paths = clientApiPaths([
    { id: "b", method: "GET", path: "/orders/search", targetFunctionId: "orders.search-orders" },
    { id: "a", method: "GET", path: "/orders", targetFunctionId: "orders.search-orders" },
    { id: "c", method: "HEAD", path: "/orders/:orderId", targetFunctionId: "orders.get-order" },
    { id: "d", method: "GET", path: "/orders/:orderId", targetFunctionId: "orders.get-order" },
    { id: "e", method: "OPTIONS", path: "/orders/:orderId", targetFunctionId: "orders.get-order" },
    { id: "f", method: "GET", path: "/files/*parts", targetFunctionId: "navigation.browse-path" },
    { id: "g", method: "GET", path: "/docs/*parts?", targetFunctionId: "navigation.browse-path" },
  ]);
  expect(Object.fromEntries([...paths].map(([id, path]) => [id, path.join(".")]))).toEqual({
    a: "orders.searchOrders",
    b: "orders.searchOrdersSearch",
    c: "orders.getOrderHead",
    d: "orders.getOrder",
    e: "orders.getOrderOptions",
    f: "navigation.browsePathFiles",
    g: "navigation.browsePath",
  });
});
