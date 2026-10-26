/** Ensures every starter ships the same application guidance and resolvable references. */
import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const templates = ["minimal", "api", "agent", "fullstack", "tasks"];
const root = resolve(import.meta.dir, "../../templates/default/v1");
const files = [
  "SKILL.md",
  "references/domain-apis.md",
  "references/agent-apis.md",
  "references/data-apis.md",
  "references/testing-apis.md",
];

test("all starters ship consistent domain guidance with usable local references", () => {
  for (const file of files) {
    const canonical = readFileSync(resolve(root, "minimal/.agents/skills/relkit", file), "utf8");
    for (const template of templates) {
      const path = resolve(root, template, ".agents/skills/relkit", file);
      const source = readFileSync(path, "utf8");
      expect(source, `${template}/${file}`).toBe(canonical);
      for (const [, target] of source.matchAll(/\]\(([^)]+\.md)(?:#[^)]*)?\)/g)) {
        if (!target || /^[a-z]+:/i.test(target)) continue;
        expect(existsSync(resolve(dirname(path), target)), `${path} -> ${target}`).toBe(true);
      }
    }
  }
});
