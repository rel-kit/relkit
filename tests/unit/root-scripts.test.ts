import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

test("test:all points to a checked-in orchestration script", async () => {
  const root = join(import.meta.dir, "..", "..");
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  expect(packageJson.scripts?.["test:all"]).toBe("bun run scripts/test-all.ts");
  expect(await Bun.file(join(root, "scripts", "test-all.ts")).exists()).toBe(true);
});
