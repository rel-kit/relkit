import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  defineConnectionContract,
  defineIntegrationReference,
  defineLocalRecipeReference,
  defineProviderAdapter,
  defineProviderBehavior,
  defineProviderCapability,
  normalizeProviderSource,
} from "@relkit/provider";
import { docker } from "./src/index.ts";
import { dockerMaterializer } from "./src/runtime/index.ts";

const integration = defineIntegrationReference("redis");

function redis(connection: Readonly<Record<string, string>> = {}) {
  return defineProviderAdapter({
    integration,
    capability: defineProviderCapability("cache"),
    adapterId: "redis",
    connectionContract: defineConnectionContract({ url: {} }),
    connection,
    behavior: defineProviderBehavior({}),
    localRecipe: defineLocalRecipeReference(integration, "redis-docker", 1),
  });
}

test("creates pure local-only and local-overlay descriptors", () => {
  const localOnly = docker(redis());
  const overlay = docker(redis({ url: "redis://cache.example" }));

  expect(normalizeProviderSource(localOnly).source).toEqual({ kind: "local-only" });
  expect(normalizeProviderSource(overlay).source).toEqual({ kind: "connected" });
  expect(Object.isFrozen(localOnly)).toBe(true);
});

test("rejects nested source wrappers", () => {
  const unsafeDocker = docker as (value: unknown) => unknown;
  expect(() => unsafeDocker(docker(redis()))).toThrow("Provider source wrappers cannot be nested");
});

test("exports static Docker materializer identity without engine I/O", () => {
  expect(dockerMaterializer).toEqual({
    kind: "local-service-materializer",
    protocolVersion: 1,
    integrationId: "docker",
  });
  expect(Object.isFrozen(dockerMaterializer)).toBe(true);

  for (const source of ["index.ts", "runtime/index.ts"]) {
    const contents = readFileSync(join(import.meta.dir, "src", source), "utf8");
    expect(contents).not.toMatch(/node:(?:child_process|fs)|\b(?:Bun\.spawn|process)\b/);
  }
});
