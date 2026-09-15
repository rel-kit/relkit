import { expect, test } from "bun:test";
import {
  LOCAL_SERVICE_RECIPE_PROTOCOL_VERSION,
  normalizeLocalServiceRecipe,
  type CompositeLocalServiceRecipe,
} from "./src/index.ts";

const base = {
  kind: "local-service-recipe" as const,
  protocolVersion: LOCAL_SERVICE_RECIPE_PROTOCOL_VERSION,
  integrationId: "test",
  recipeId: "composite",
  recipeVersion: 2 as const,
  materializerId: "docker" as const,
  volumes: { data: { mountPath: "/data", persistent: true } },
  outputs: () => ({}),
};

test("normalizes grouped composite units in dependency order", () => {
  const recipe = {
    ...base,
    containers: [{ id: "database", image: "postgres@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", volumes: [{ name: "data", mountPath: "/data" }], health: { command: ["true"], intervalMs: 100, timeoutMs: 100, retries: 2 } }],
    workers: [{ id: "worker", image: "worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", dependsOn: ["database"], health: { command: ["true"], intervalMs: 100, timeoutMs: 100, retries: 2 } }],
  } satisfies CompositeLocalServiceRecipe;
  expect(normalizeLocalServiceRecipe(recipe).units.map((unit) => unit.id)).toEqual(["database", "worker"]);
});

test("rejects cycles and secret declarations that cannot be resolved", () => {
  const cycle = {
    ...base,
    units: [
      { id: "a", kind: "container", image: "a", dependsOn: ["b"] },
      { id: "b", kind: "worker", image: "b", dependsOn: ["a"] },
    ],
  } satisfies CompositeLocalServiceRecipe;
  expect(() => normalizeLocalServiceRecipe(cycle)).toThrow("dependency cycle");
  const secret = {
    ...base,
    units: [{ id: "a", kind: "container", image: "a", environment: { TOKEN: { secret: "missing" } } }],
    environment: { TOKEN: { secret: "missing" } },
  } satisfies CompositeLocalServiceRecipe;
  expect(() => normalizeLocalServiceRecipe(secret)).toThrow("secret environment");
});

test("rejects duplicate ports and mounts in one unit", () => {
  const recipe = {
    ...base,
    units: [{
      id: "api",
      kind: "container",
      image: "api",
      ports: { http: 8080, metrics: 8080 },
      volumes: [{ name: "data", mountPath: "/data" }, { name: "data", mountPath: "/other" }],
    }],
  } satisfies CompositeLocalServiceRecipe;
  expect(() => normalizeLocalServiceRecipe(recipe)).toThrow("Duplicate local-service unit port");
});
