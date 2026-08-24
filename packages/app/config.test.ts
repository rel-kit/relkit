import { expect, test } from "bun:test";
import { defineConfig } from "./src/config";

test("defineConfig preserves typed values in an immutable public descriptor", () => {
  const config = defineConfig({
    server: { port: 4100 },
    inspector: { port: 4210 },
    deployment: { target: "aws", adapter: "pulumi" },
  });
  expect(config).toEqual({
    server: { port: 4100 },
    inspector: { port: 4210 },
    deployment: { target: "aws", adapter: "pulumi" },
  });
  expect(Object.isFrozen(config)).toBe(true);
  expect(Object.isFrozen(config.server)).toBe(true);
});
