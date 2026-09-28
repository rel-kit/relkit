import { expect, test } from "vitest";
import { Effect } from "effect";
import { buildRequestEffect } from "../src/generate-request.js";
import { buildResponsesEffect } from "../src/generate-response.js";
import { generateOpenApi } from "../src/generate.js";
import { serviceContextEffect, serviceForEffect } from "../src/generate-services.js";
import { documentTagsEffect } from "../src/generate-tags.js";
import { openApiPathEffect } from "../src/generate-utils.js";
import { graph } from "./generate-fixture.js";

test("request projection preserves unnamed body schemas and missing nested schema fallback", () => {
  const unnamed = Effect.runSync(
    buildRequestEffect(
      {
        kind: "input",
        fields: {
          body: { kind: "body" },
          optional: { kind: "optional", value: { kind: "body", name: "optional" } },
          nested: { kind: "nested", fields: { header: { kind: "header", name: "x-test" } } },
        },
      },
      { type: "object", properties: { body: { type: "number" } } },
      "/:/*",
    ),
  );
  expect(unnamed.body?.content["application/json"]?.schema).toEqual({ type: "number" });
  expect(unnamed.parameters).toEqual([
    { in: "header", name: "x-test", required: true, schema: {} },
    { in: "path", name: "param1", required: true, schema: { type: "string" } },
    { in: "path", name: "wildcard2", required: true, schema: { type: "string" } },
  ]);
  expect(Effect.runSync(openApiPathEffect("/:/*"))).toBe("/{param1}/{wildcard2}");

  const optionalOnly = Effect.runSync(
    buildRequestEffect(
      {
        kind: "optional",
        value: { kind: "body", name: "value" },
      },
      null,
      "/",
    ),
  );
  expect(optionalOnly.body?.required).toBe(false);
  expect(optionalOnly.body?.content["application/json"]?.schema).toEqual({
    type: "object",
    properties: { value: {} },
  });
});

test("response projection handles wrapper schemas, duplicate no-content responses, and generic entries", () => {
  const source = graph(false);
  const target = source.nodes.find((node) => node.kind === "function");
  if (target?.kind !== "function") throw new Error("invalid fixture");
  const responses = Effect.runSync(
    buildResponsesEffect(
      [
        { kind: "response", id: "first", status: 203, schema: null },
        {
          kind: "response",
          id: "second",
          status: 203,
          schema: { $relkit: "schema", jsonSchema: { type: "boolean" } },
        },
        { kind: "success", id: "empty", status: 304, schema: null },
        { kind: "validation-error", id: "invalid", status: 422, schema: null },
        { kind: "error", id: "unknown", status: 500, schema: { type: "string" } },
      ],
      target,
    ),
  );
  expect(responses["203"]?.description).toBe("Response first; Response second");
  expect(responses["203"]?.content?.["application/json"]?.schema).toEqual({ type: "boolean" });
  expect(responses["304"]?.content).toBeUndefined();
  expect(responses["422"]?.description).toBe("Validation error");
  expect(responses["500"]?.content?.["application/json"]?.schema).toMatchObject({
    properties: { data: { type: "string" } },
  });
});

test("service index registers explicit existing and synthetic services", () => {
  const source = graph(false);
  const target = source.nodes.find((node) => node.kind === "function");
  const trigger = source.nodes.find((node) => node.kind === "trigger");
  if (target?.kind !== "function" || trigger?.kind !== "trigger" || trigger.triggerType !== "http")
    throw new Error("invalid fixture");
  const existing = { ...target, id: "other-function", serviceId: "orders" };
  const created = { ...target, id: "new-function", serviceId: "new-service" };
  const context = Effect.runSync(
    serviceContextEffect({
      ...source,
      nodes: [...source.nodes, existing, created],
    }),
  );
  expect(context.byFunction.get("other-function")?.id).toBe("orders");
  expect(context.byFunction.get("new-function")?.id).toBe("new-service");
  expect(context.sources.map((service) => service.id)).toEqual(["orders", "new-service"]);
  const noService = { byId: context.byId, byFunction: new Map(), sources: context.sources };
  expect(Effect.runSync(serviceForEffect(noService, trigger, created))).toBeUndefined();
  expect(
    Effect.runSync(serviceForEffect(noService, { ...trigger, serviceId: "orders" }, created))?.id,
  ).toBe("orders");
});

test("top-level tags keep the first description for a duplicate name", () => {
  const tags = Effect.runSync(
    documentTagsEffect(
      [
        { id: "b", tags: ["shared"], description: "Second" },
        { id: "a", tags: ["shared"], description: "First" },
      ],
      ["shared", "extra"],
    ),
  );
  expect(tags).toEqual([{ name: "extra" }, { name: "shared", description: "First" }]);
});

test("missing metadata and root catch-all paths retain safe defaults", () => {
  const source = graph(false);
  const trigger = source.nodes.find((node) => node.kind === "trigger");
  if (trigger?.kind !== "trigger") throw new Error("invalid fixture");
  Object.assign(trigger.config, {
    path: "/*parts?",
    rawHandler: true,
    title: undefined,
    description: undefined,
    tags: undefined,
    request: null,
  });
  const document = generateOpenApi(source);
  expect(document.paths["/"]?.get?.summary).toBeUndefined();
  expect(document.paths["/"]?.get?.tags).toBeUndefined();
  expect(document.paths["/{parts}"]?.get?.operationId).toBe("orders.get.catch-all");
  expect(Effect.runSync(openApiPathEffect(""))).toBe("/");
});

test("request and response projections retain defaults for sparse metadata", () => {
  const query = Effect.runSync(buildRequestEffect({ kind: "query" }, null, "/"));
  expect(query.parameters[0]).toMatchObject({ name: "value", schema: {} });
  const wrapped = Effect.runSync(
    buildRequestEffect(
      { kind: "body", name: "payload" },
      { $relkit: "schema", jsonSchema: { type: "string" } },
      "/",
    ),
  );
  expect(wrapped.body?.content["application/json"]?.schema).toEqual({
    type: "object",
    properties: { payload: { type: "string" } },
    required: ["payload"],
  });
  expect(Effect.runSync(buildRequestEffect({ kind: "ignored" }, null, "/")).parameters).toEqual([]);

  const source = graph(false);
  const target = source.nodes.find((node) => node.kind === "function");
  if (target?.kind !== "function") throw new Error("invalid fixture");
  Object.assign(target, { errors: null });
  const responses = Effect.runSync(
    buildResponsesEffect(
      [
        { kind: "success", id: "first", status: 203, schema: { type: "integer" } },
        { kind: "response", id: "second", status: 203, schema: null },
        { kind: "response", id: "empty-a", status: 204, schema: null },
        { kind: "response", id: "empty-b", status: 204, schema: null },
        { kind: "error", status: 400, schema: null },
      ],
      target,
    ),
  );
  expect(responses["203"]?.content?.["application/json"]?.schema).toEqual({ type: "integer" });
  expect(responses["204"]?.content).toBeUndefined();
  expect(responses["400"]?.content?.["application/json"]?.schema).toMatchObject({
    properties: { code: { const: "error" } },
  });
  expect(Object.keys(Effect.runSync(buildResponsesEffect(null, target)))).toEqual(["422"]);
});
