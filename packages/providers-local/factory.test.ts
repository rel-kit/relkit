import { expect, test } from "bun:test";
import { external, s3 } from "@zsys/app";
import { getLocalProviderFactory, localProviderFactories } from "./src/factory.ts";

test("exports one deterministic memory factory for every provider capability", async () => {
  expect(Object.keys(localProviderFactories).sort()).toEqual([
    "buckets",
    "cache",
    "events",
    "jobs",
    "models",
    "observability",
  ]);
  const factory = getLocalProviderFactory("buckets");
  expect(factory).toMatchObject({ capability: "buckets", adapter: "memory" });
  const binding = external(
    s3({ endpoint: "https://example.test", bucketName: "assets", region: "auto" }),
  );
  const generation = await factory!.create({
    generationId: "provider-local-test",
    environment: "test",
    capability: "buckets",
    profile: "default",
    binding,
    configuration: {},
  });
  expect(generation.value).toBeDefined();
  await generation.release?.();
});
