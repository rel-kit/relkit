import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { packageTestFiles } from "../../scripts/test-packages.ts";

test("package test discovery includes standalone integrations without build output", () => {
  const files = packageTestFiles(resolve(import.meta.dir, "../.."));

  expect(files).toContain("integrations/packages/redis/redis.test.ts");
  expect(files).toContain("packages/provider/protocol.test.ts");
  expect(files).toEqual([...new Set(files)].sort());
  expect(files.every((path) => /^(integrations|packages)\//.test(path))).toBe(true);
  expect(files.some((path) => path.includes("/dist/"))).toBe(false);
});
