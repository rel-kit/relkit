import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import {
  LocalServiceValidationFailure,
  normalizeLocalServiceRecipe,
  normalizeLocalServiceRecipeEffect,
  type LocalServiceRecipeInput,
} from "../src/index.js";

const unit = { id: "api", kind: "container" as const, image: "api" };
const base = {
  kind: "local-service-recipe" as const,
  protocolVersion: 2 as const,
  integrationId: "test",
  recipeId: "composite",
  recipeVersion: 2 as const,
  materializerId: "docker" as const,
  units: [unit],
  volumes: {},
  outputs: () => ({}),
};

function checkFailure(candidate: unknown, message: string): void {
  const recipe = candidate as LocalServiceRecipeInput;
  const result = Effect.runSync(Effect.result(normalizeLocalServiceRecipeEffect(recipe)));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) {
    expect(result.failure).toBeInstanceOf(LocalServiceValidationFailure);
    expect(result.failure.message).toContain(message);
  }
  expect(() => normalizeLocalServiceRecipe(recipe)).toThrow(message);
}

test.each([
  ["null recipe", null, "Local-service recipe"],
  ["wrong kind", { ...base, kind: "other" }, "Local-service recipe"],
  ["invalid integration", { ...base, integrationId: "not stable" }, "Local-service recipe"],
  ["invalid recipe ID", { ...base, recipeId: "not stable" }, "Local-service recipe"],
  ["invalid materializer", { ...base, materializerId: "other" }, "Local-service recipe"],
  ["wrong protocol", { ...base, protocolVersion: 1 }, "Local-service recipe"],
  ["wrong recipe version", { ...base, recipeVersion: 3 }, "Local-service recipe"],
  ["missing volumes", { ...base, volumes: undefined }, "Local-service volumes"],
  ["array volumes", { ...base, volumes: [] }, "Local-service volumes"],
  ["invalid network", { ...base, network: { internal: "true" } }, "Local-service network"],
  ["invalid ownership", { ...base, ownership: { scope: "other" } }, "Local-service ownership"],
  ["empty units", { ...base, units: [] }, "at least one unit"],
  ["empty groups", { ...base, units: undefined }, "at least one unit"],
  ["nonarray units", { ...base, units: {} }, "Composite recipe units"],
  ["mixed units", { ...base, containers: [unit] }, "cannot mix units"],
  ["invalid group", { ...base, units: undefined, workers: {} }, "Composite recipe units"],
  ["duplicate IDs", { ...base, units: [unit, unit] }, "Duplicate local-service unit"],
  ["invalid unit ID", { ...base, units: [{ ...unit, id: "bad id" }] }, "unit identity"],
  ["empty image", { ...base, units: [{ ...unit, image: "  " }] }, "unit identity"],
  ["nonstring image", { ...base, units: [{ ...unit, image: null }] }, "unit identity"],
  ["invalid command", { ...base, units: [{ ...unit, command: ["bad\ncommand"] }] }, "unit command"],
  ["invalid port name", { ...base, units: [{ ...unit, ports: { "bad name": 80 } }] }, "unit port"],
  ["invalid port number", { ...base, units: [{ ...unit, ports: { http: 65536 } }] }, "unit port"],
  [
    "duplicate port",
    { ...base, units: [{ ...unit, ports: { http: 80, admin: 80 } }] },
    "Duplicate local-service unit port",
  ],
  [
    "invalid mount",
    { ...base, units: [{ ...unit, volumes: [{ name: "data", mountPath: "../data" }] }] },
    "unit volume",
  ],
  [
    "duplicate mount",
    {
      ...base,
      units: [
        {
          ...unit,
          volumes: [
            { name: "data", mountPath: "/a" },
            { name: "data", mountPath: "/b" },
          ],
        },
      ],
    },
    "Duplicate local-service unit volume",
  ],
  [
    "invalid health",
    {
      ...base,
      units: [{ ...unit, health: { command: [], intervalMs: 0, timeoutMs: 1, retries: 1 } }],
    },
    "health check",
  ],
  [
    "invalid network alias",
    { ...base, units: [{ ...unit, networkAliases: ["bad alias"] }] },
    "network alias",
  ],
  ["invalid host alias", { ...base, units: [{ ...unit, hostAliases: { bad: "" } }] }, "host alias"],
  [
    "invalid volume declaration",
    { ...base, volumes: { "bad name": { mountPath: "/data" } } },
    "Local-service volume",
  ],
  [
    "missing volume path",
    { ...base, volumes: { data: { mountPath: undefined } } },
    "Local-service volume",
  ],
  [
    "traversing volume path",
    { ...base, volumes: { data: { mountPath: "/data/../other" } } },
    "Local-service volume",
  ],
  [
    "invalid volume policy",
    { ...base, volumes: { data: { mountPath: "/data", persistent: "yes" } } },
    "Local-service volume",
  ],
  [
    "unknown volume",
    { ...base, units: [{ ...unit, volumes: [{ name: "missing", mountPath: "/data" }] }] },
    "Unknown local-service volume",
  ],
  ["self dependency", { ...base, units: [{ ...unit, dependsOn: ["api"] }] }, "invalid dependency"],
  [
    "missing dependency",
    { ...base, units: [{ ...unit, dependsOn: ["missing"] }] },
    "invalid dependency",
  ],
  [
    "cycle",
    {
      ...base,
      units: [
        { ...unit, dependsOn: ["worker"] },
        { id: "worker", kind: "worker", image: "worker", dependsOn: ["api"] },
      ],
    },
    "dependency cycle",
  ],
  [
    "invalid secret declaration",
    { ...base, generatedSecrets: { key: { bytes: 7 } } },
    "generated secret",
  ],
  [
    "invalid secret encoding",
    { ...base, generatedSecrets: { key: { bytes: 8, encoding: "raw" } } },
    "generated secret",
  ],
  [
    "invalid environment key",
    { ...base, environment: { lower: { value: "x" } } },
    "secret environment",
  ],
  ["null environment value", { ...base, environment: { TOKEN: null } }, "secret environment"],
  [
    "missing environment secret",
    { ...base, environment: { TOKEN: { secret: "missing" } } },
    "secret environment",
  ],
  [
    "invalid literal environment",
    { ...base, environment: { TOKEN: { value: "bad\nvalue" } } },
    "literal environment",
  ],
  [
    "invalid unit environment",
    { ...base, units: [{ ...unit, environment: { TOKEN: { secret: "missing" } } }] },
    "secret environment",
  ],
])("rejects %s with a tagged Effect failure", (_name, candidate, message) => {
  checkFailure(candidate, message);
});
