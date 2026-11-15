/**
 * Answers every route gives are stated once in the document's description instead of being
 * generated per route: `HEAD` for a `GET` route, `OPTIONS` with `Allow`, and the 431 the HTTP
 * server sends before a route is chosen.
 */
import { expect, test } from "vitest";
import { generateOpenApi } from "../../src/openapi/index.js";
import { graph } from "./generate-fixture.js";

test("the description states HEAD, OPTIONS and 431 once", () => {
  const { description } = generateOpenApi(graph(false)).info;
  expect(description).toContain("Every `GET` route also answers `HEAD`");
  expect(description).toContain("`OPTIONS`");
  expect(description).toContain("`204`");
  expect(description).toContain("`Allow`");
  expect(description).toContain("`431`");
  expect(description).toContain("before a route is chosen");
});

test("a GET route gets no HEAD or OPTIONS operation and no operation lists 431", () => {
  const document = generateOpenApi(graph(false));
  const item = document.paths["/orders/{id}"] ?? {};
  expect(Object.keys(item)).toEqual(["get"]);
  for (const pathItem of Object.values(document.paths))
    for (const operation of Object.values(pathItem))
      expect(Object.keys(operation?.responses ?? {})).not.toContain("431");
});

test("the description is the same for every graph", () => {
  expect(generateOpenApi(graph(true)).info.description).toBe(
    generateOpenApi(graph(false)).info.description,
  );
});
