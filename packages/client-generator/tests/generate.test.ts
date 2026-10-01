import { expect, test } from "vitest";
import { Effect } from "effect";
import { catchAllGraph, graph, unmappedPathGraph } from "./fixtures/generator-graphs.js";
import {
  generateClient,
  generateClientEffect,
  generateClientTypeScriptEffect,
  generateClientContractDocument,
  generateContract,
} from "../src/index.ts";
import { clientRoutes, responseType } from "../src/generate-types.ts";
import { generateClientContractDocumentEffect } from "../src/generate-contract.ts";
test("generates a stable oRPC contract and shared client entry", () => {
  const first = generateClient(graph(false));
  const second = generateClient(graph(true));
  expect(first).toBe(second);
  expect(Effect.runSync(generateClientEffect(graph(false)))).toBe(first);
  expect(Effect.runSync(generateClientTypeScriptEffect(graph(false)))).toBe(first);
  expect(first).toContain('export { createClient, ORPCError } from "@relkit/client";');
  const contract = generateContract(graph(false));
  expect(contract).toBe(generateContract(graph(true)));
  expect(contract).toContain('\"orders.get\": oc.errors({ \"orders.not-found\"');
  expect(contract).toContain(
    'schema<{ \"authorization\": string; \"id\": string; \"sku\": string; \"tag\"?: string }>()',
  );
});
test("keeps REST-only path metadata out of the function-backed procedure input", () => {
  const generated = generateContract(unmappedPathGraph());
  const document = generateClientContractDocument(unmappedPathGraph(), "sha256:test");
  expect(generated).toContain('\"reports.read\": oc.input(schema<{ \"payload\": string }>()');
  expect(document).toContain('\"path\":\"/reports/:reportId\"');
});
test("keeps the envelope status optional when an error has no HTTP mapping", () => {
  const inputGraph = graph(false);
  const target = inputGraph.nodes.find((node) => node.kind === "function") as unknown as {
    errors: unknown[];
  };
  const trigger = inputGraph.nodes.find((node) => node.kind === "trigger") as unknown as {
    config: { responses: unknown[] };
  };
  target.errors.push({
    kind: "error",
    id: "orders.unavailable",
    data: { type: "object", properties: {} },
    retry: "later",
  });
  target.errors.push(null);
  trigger.config.responses.push({
    kind: "error",
    id: "error.orders.unavailable.500",
    errorId: "orders.unavailable",
    status: 500,
  });
  const route = clientRoutes(inputGraph)[0]!;
  const response = route.responses.find((entry) => entry.errorId === "orders.unavailable")!;
  expect(responseType(route, response)).toContain('"status"?: number');
  expect(generateClientContractDocument(inputGraph, "sha256:test")).toContain(
    '"orders.unavailable"',
  );
});
test("preserves catch-all REST metadata in the client-safe document", () => {
  const document = generateClientContractDocument(catchAllGraph(), "sha256:test");
  expect(document).toContain('\"path\":\"/files/*parts\"');
  expect(document).toContain('\"path\":\"/docs/*parts?\"');
});
test("serializes errors without an HTTP response and unwraps JSON Schema data", () => {
  const inputGraph = graph(false);
  const target = inputGraph.nodes.find((node) => node.kind === "function") as unknown as {
    errors: unknown[];
  };
  target.errors = [{ id: "wrapped", data: { jsonSchema: { type: "string" } } }, { id: "missing" }];
  const document = JSON.parse(
    Effect.runSync(generateClientContractDocumentEffect(inputGraph, "sha256:test")),
  );
  expect(document.procedures[0].errors).toEqual([
    { id: "wrapped", schema: { type: "string" }, status: 500 },
    { id: "missing", schema: {}, status: 500 },
  ]);
});
