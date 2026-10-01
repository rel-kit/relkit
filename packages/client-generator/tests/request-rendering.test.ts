import { expect, test } from "vitest";
import { Effect } from "effect";
import { graph } from "./fixtures/generator-graphs.js";
import type { ClientRoute, MappingLeaf } from "../src/generate-types.types.js";
import { clientRoutes, mappedInputTypeEffect } from "../src/generate-types.js";
import { acceptsMissingInputEffect, routeMethodEffect } from "../src/generate-request.js";
import { runtimeHelpersEffect } from "../src/generate-runtime-helpers.js";
const route = clientRoutes(graph(false))[0]!;
const names = { method: "getOrder", type: "GetOrder" };
test("renders path, query, header, and JSON body request code", () => {
  const text = Effect.runSync(routeMethodEffect(route, names)).join("\n");
  expect(text).toContain("async getOrder(input: GetOrderInput)");
  expect(text).toContain("path = path.replace");
  expect(text).toContain("appendQuery(query");
  expect(text).toContain("setHeader(headers");
  expect(text).toContain("setBodyValue(payload");
  expect(text).toContain('headers["content-type"] = "application/json"');
  expect(Effect.runSync(acceptsMissingInputEffect(route))).toBe(false);
});
test("renders optional catch-all, cookies, multipart, and constant fields", () => {
  const fields: MappingLeaf[] = [
    leaf("cookie", ["session"], "session"),
    leaf("multipart", ["upload"], "upload"),
    leaf("constant", ["version"], "version", 1),
  ];
  const variant: ClientRoute = {
    ...route,
    trigger: {
      ...route.trigger,
      config: { ...route.trigger.config, path: "/files/*parts?" },
    },
    fields,
  };
  const text = Effect.runSync(routeMethodEffect(variant, names)).join("\n");
  expect(text).toContain("replacePathSegments");
  expect(text).toContain("appendCookie(cookies");
  expect(text).toContain("appendFormValue(form");
  expect(text).toContain("requestBody = form");
  expect(Effect.runSync(acceptsMissingInputEffect(variant))).toBe(false);
});
test("renders whole-body and bodyless methods", () => {
  const whole = { ...route, fields: [leaf("whole-body", [], "body")] };
  const wholeText = Effect.runSync(routeMethodEffect(whole, names)).join("\n");
  expect(wholeText).toContain("const wholeBody = readPath(input");
  expect(wholeText).toContain("JSON.stringify(wholeBody)");
  const noBody: ClientRoute = {
    ...route,
    trigger: {
      ...route.trigger,
      config: { ...route.trigger.config, path: "/health" },
    },
    fields: [],
  };
  const text = Effect.runSync(routeMethodEffect(noBody, names)).join("\n");
  expect(text).toContain("async getOrder(input: GetOrderInput = {} as GetOrderInput)");
  expect(text).not.toContain("requestBody");
  expect(Effect.runSync(acceptsMissingInputEffect(noBody))).toBe(true);
});
test("renders a constant-only JSON body without reading request input", () => {
  const variant: ClientRoute = {
    ...route,
    trigger: { ...route.trigger, config: { ...route.trigger.config, path: "/version" } },
    fields: [leaf("constant", ["version"], "version", 1)],
  };
  const text = Effect.runSync(routeMethodEffect(variant, names)).join("\n");
  expect(text).toContain('setBodyValue(payload, ["version"], 1)');
  expect(text).toContain('headers["content-type"] = "application/json"');
});
test("adds unmapped named and catch-all route parameters to generated input types", () => {
  const named: ClientRoute = {
    ...route,
    trigger: { ...route.trigger, config: { ...route.trigger.config, path: "/items/:itemId" } },
    fields: [],
  };
  expect(Effect.runSync(mappedInputTypeEffect(named))).toContain('"itemId": string');
  const catchAll: ClientRoute = {
    ...named,
    trigger: { ...named.trigger, config: { ...named.trigger.config, path: "/files/*parts" } },
  };
  expect(Effect.runSync(mappedInputTypeEffect(catchAll))).toContain('"parts": readonly string[]');
  const missingSchema: ClientRoute = {
    ...named,
    trigger: { ...named.trigger, config: { ...named.trigger.config, path: "/items" } },
    fields: [leaf("body", ["missing"], "missing")],
  };
  expect(Effect.runSync(mappedInputTypeEffect(missingSchema))).toContain('"missing": unknown');
});
test("emits the runtime helper functions used by generated methods", () => {
  const source = Effect.runSync(runtimeHelpersEffect()).join("\n");
  for (const helper of [
    "function joinUrl",
    "function readPath",
    "function setBodyValue",
    "function appendQuery",
    "function setHeader",
    "function replacePathSegments",
    "function appendCookie",
    "function appendFormValue",
    "async function request",
  ])
    expect(source).toContain(helper);
});

test("uses stable fallback names for unnamed query, header, cookie, and form fields", () => {
  const variant: ClientRoute = {
    ...route,
    trigger: { ...route.trigger, config: { ...route.trigger.config, path: "/upload" } },
    fields: [
      { ...leaf("query", ["search"], "unused"), name: undefined, outputPath: [] },
      { ...leaf("header", ["token"], "unused"), name: undefined },
      { ...leaf("cookie", ["session"], "unused"), name: undefined },
      { ...leaf("multipart-all", ["files"], "unused"), name: undefined, outputPath: [] },
      { ...leaf("constant", ["version"], "unused", 1), name: undefined, outputPath: [] },
    ],
  };
  const text = Effect.runSync(routeMethodEffect(variant, names)).join("\n");
  expect(text).toContain('appendQuery(query, "query0"');
  expect(text).toContain('setHeader(headers, "header0"');
  expect(text).toContain('appendCookie(cookies, "cookie0"');
  expect(text).toContain('appendFormValue(form, "field0"');
  expect(text).toContain('appendFormValue(form, "field1", 1)');
});
function leaf(kind: string, inputPath: string[], name: string, value?: unknown): MappingLeaf {
  return { kind, inputPath, outputPath: [name], name, value, optional: false, defaulted: false };
}
