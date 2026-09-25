import { Effect } from "effect";
import { expect, test } from "vitest";
import { normalizeLocalServiceRecipe, type CompositeLocalServiceRecipe } from "../src/index.js";
import { runLocalService } from "../src/local-service-observability.js";

const base = {
  kind: "local-service-recipe" as const,
  protocolVersion: 2 as const,
  integrationId: "test",
  recipeId: "composite",
  recipeVersion: 2 as const,
  materializerId: "docker" as const,
  volumes: { data: { mountPath: "/data" } },
  generatedSecrets: { key: { bytes: 8, encoding: "base64url" as const } },
  environment: { LOG_LEVEL: { value: "debug" } },
  outputs: () => ({}),
};

test("sorts independent units and preserves valid optional fields", () => {
  const recipe = {
    ...base,
    units: [
      {
        id: "zeta",
        kind: "worker" as const,
        image: "worker",
        volumes: [{ name: "data", mountPath: "/data" }],
        environment: { KEY: { secret: "key" } },
        networkAliases: ["worker"],
        hostAliases: { database: "127.0.0.1" },
      },
      { id: "alpha", kind: "container" as const, image: "api" },
    ],
    network: { internal: true },
    ownership: { scope: "project" as const, retainVolumes: false },
    initialize: async () => {},
  } satisfies CompositeLocalServiceRecipe;
  const normalized = normalizeLocalServiceRecipe(recipe);
  expect(normalized.units.map((unit) => unit.id)).toEqual(["alpha", "zeta"]);
  expect(normalized.units[1]).toMatchObject({
    environment: { KEY: { secret: "key" } },
    networkAliases: ["worker"],
    hostAliases: { database: "127.0.0.1" },
  });
  expect(normalized.network).toEqual({ internal: true });
  expect(normalized.ownership).toEqual({ scope: "project", retainVolumes: false });
  expect(normalized.initialize).toBe(recipe.initialize);
});

test("normalizes initializer group before dependent containers", () => {
  const recipe = {
    ...base,
    init: [{ id: "setup", image: "busybox" }],
    containers: [{ id: "api", image: "api", dependsOn: ["setup"] }],
    workers: [],
  } satisfies CompositeLocalServiceRecipe;
  expect(normalizeLocalServiceRecipe(recipe).units.map((unit) => unit.kind)).toEqual([
    "init",
    "container",
  ]);
});

test("synchronous Effect adapter propagates defects", () => {
  const defect = new Error("unexpected");
  expect(() => runLocalService(Effect.die(defect))).toThrow(defect);
});
