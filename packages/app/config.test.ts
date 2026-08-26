import { expect, test } from "bun:test";
import { defineConfig } from "./src/config";
import { defineEnv } from "@zsys/config";
import { external, s3 } from "./src/providers";

const bucket = () =>
  external(s3({ endpoint: "http://localhost", bucketName: "assets", region: "local" }));

test("defineConfig preserves typed values in an immutable public descriptor", () => {
  const config = defineConfig({
    id: "config-test",
    env: defineEnv({}),
    server: { port: 4100 },
    inspector: { port: 4210, maxPreviewBytes: 2048 },
    deployment: { target: "aws", adapter: "pulumi" },
  });
  expect(config.kind).toBe("app");
  expect(config.id).toBe("config-test");
  expect(config.server).toEqual({ port: 4100 });
  expect(config.inspector).toEqual({ port: 4210, maxPreviewBytes: 2048 });
  expect(Object.isFrozen(config)).toBe(true);
  expect(Object.isFrozen(config.server)).toBe(true);
});

test("defineConfig infers singleton defaults and validates explicit selections", () => {
  const config = defineConfig({
    env: defineEnv({}),
    buckets: { assets: bucket() },
  });
  expect(config.defaults).toEqual({ bucket: "assets" });
  expect(() =>
    defineConfig({
      env: defineEnv({}),
      buckets: { assets: bucket() },
      defaults: { bucket: "missing" },
    }),
  ).toThrow("defaults.bucket must reference a buckets profile");
});
