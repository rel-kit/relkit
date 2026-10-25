/** Keeps active repository instructions usable after documentation files move. */
import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

test("active repository documentation links target existing content", () => {
  const root = resolve(import.meta.dir, "../../..");
  for (const file of [
    "README.md",
    "docs/README.md",
    "docs/getting-started.md",
    "docs/documentation-audit.md",
    "docs/deployment.md",
  ]) {
    const source = readFileSync(resolve(root, file), "utf8");
    for (const [target] of source.matchAll(/apps\/docs\/content\/[^\s`\)"#<>]+\.mdx/g))
      expect(existsSync(resolve(root, target)), `${file}: ${target}`).toBe(true);
  }
});
