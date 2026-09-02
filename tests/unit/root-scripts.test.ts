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
  expect(packageJson.scripts?.prepush).toBe(
    "docker info >/dev/null && bun run verify && bun run test:container && bun run test:local-docker && bun run test:deployment && bun run test:inspector:browser && bun run test:e2e",
  );
});
