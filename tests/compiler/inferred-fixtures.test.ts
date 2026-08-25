import { expect, test } from "bun:test";
import { compileFixture } from "./fixture-runner.ts";

test("compiles every inferred declaration kind and binds canonical identities", async () => {
  const sorted = await compileFixture("valid-inferred-identities");
  expect(sorted.diagnostics).toEqual([]);
  expect(sorted.normalization.descriptors.map(({ kind, id }) => `${kind}:${id}`).sort()).toEqual([
    "agent:support",
    "app:inferred-app",
    "function:files.read-files",
    "function:health.check",
    "function:orders.authorize",
    "function:orders.get-order",
    "middleware:orders-auth",
    "route:health.custom-route",
    "route:route.get.files.catch-all-parts",
    "route:route.get.orders.by-order-id",
    "route:route.get.root",
    "service:orders",
    "tool:lookup-order",
    "transform:orders.normalize-id",
  ]);

  const graph = sorted.normalization.graph!;
  expect(graph.nodes.find(({ kind, id }) => kind === "service" && id === "orders")).toMatchObject({
    members: [{ name: "getOrder", functionId: "orders.get-order" }],
    middleware: [{ id: "orders.context" }],
  });
  expect(graph.nodes.filter(({ kind }) => kind === "trigger").map(({ id }) => id)).toEqual([
    "health.custom-route",
    "route.get.files.catch-all-parts",
    "route.get.orders.by-order-id",
    "route.get.root",
  ]);
  expect(JSON.stringify(graph.nodes.find(({ id }) => id === "orders.get-order"))).toContain(
    "InvalidError",
  );

  for (const id of [
    "orders",
    "orders.get-order",
    "orders.context",
    "orders-auth",
    "orders.normalize-id",
    "lookup-order",
    "route.get.root",
    "route.get.orders.by-order-id",
    "route.get.files.catch-all-parts",
    "health.custom-route",
    "functions.orders.get-order-function.InvalidError",
  ]) {
    expect(sorted.manifest).toContain(`, "${id}");`);
  }
  expect(sorted.manifest).toContain('["functions"]["getOrder"]');
  expect(sorted.manifest).toContain('["errors"][0]');
  expect(sorted.manifest).toContain('["target"]');
});

test("keeps inferred fixture artifacts stable across roots and candidate order", async () => {
  const sorted = await compileFixture("valid-inferred-identities", {
    order: "sorted",
    generationId: "root-one",
  });
  const reversed = await compileFixture("valid-inferred-identities", {
    order: "reverse",
    generationId: "root-two",
  });
  const randomized = await compileFixture("valid-inferred-identities", {
    order: "random",
    generationId: "root-three",
  });

  for (const run of [reversed, randomized]) {
    expect(run.graphBytes).toBe(sorted.graphBytes);
    expect(run.graphHash).toBe(sorted.graphHash);
    expect(run.manifest).toBe(sorted.manifest);
    expect(run.diagnosticsBytes).toBe(sorted.diagnosticsBytes);
  }
});
