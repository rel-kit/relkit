/** Keeps CONTRIBUTING, AGENTS.md and the pull request template in line with the checks they name. */
import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { QUICKSTART_LIMIT, quickstart } from "../../scripts/contributor-quickstart.ts";

const root = resolve(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const contributing = read("CONTRIBUTING.md");
const template = read(".github/pull_request_template.md");

test("CONTRIBUTING starts with a short quickstart that ends in prepush", () => {
  expect(contributing.split("\n").slice(0, 3)).toEqual([
    "# Contributing to RelKit",
    "",
    "## Quickstart",
  ]);
  const { lines, commands } = quickstart(contributing);
  expect(lines).toBeLessThanOrEqual(QUICKSTART_LIMIT);
  expect(commands).toEqual([
    "bun install --frozen-lockfile",
    "bun run build",
    "bun run test:unit",
    "bun run prepush",
  ]);
  const scripts = JSON.parse(read("package.json")).scripts;
  for (const command of commands.slice(1)) expect(scripts).toHaveProperty(command.split(" ")[2]!);
});

test("release certification lives in the maintainer guide", () => {
  expect(contributing).not.toContain("## Changesets");
  expect(contributing).toContain("(docs/maintainers/releasing.md)");
  expect(read("docs/maintainers/releasing.md")).toContain("### GitHub App setup");
});

test("the pull request template asks whether the change needs a spec", () => {
  expect(template).toContain("## OpenSpec");
  expect(template).toMatch(/needs an OpenSpec change[^\n]*public API or descriptor kind/u);
  expect(template).toContain("needs no OpenSpec change");
  expect(contributing).toContain("## When a change needs an OpenSpec change");
});

test("the stop-doing rules appear in CONTRIBUTING and the review checklist", () => {
  const checklist = template.slice(template.indexOf("## Review checklist"));
  expect(contributing).toContain("## Stop-doing rules until 1.0");
  for (const rule of [
    /new feature area/u,
    /--strict/u,
    /raw evidence or bug-fix report files/u,
    /only one example application/u,
    /AWS is not presented as the lead deploy target/u,
  ])
    expect(checklist).toMatch(rule);
});

test("every rule in the rules table names an existing check or says advisory", () => {
  const section = contributing.slice(contributing.indexOf("## Rules and their checks"));
  const rows = section
    .split("\n")
    .filter((line) => line.startsWith("| ") && !/^\| (?:Rule|-)/u.test(line));
  expect(rows.length).toBeGreaterThan(10);
  const workflows = read(".github/workflows/checks.yml");
  const scripts = JSON.parse(read("package.json")).scripts as Record<string, string>;
  for (const row of rows) {
    const enforcedBy = row.split("|").at(-2)!.trim();
    for (const [, script] of enforcedBy.matchAll(/`bun scripts\/([\w-]+\.ts)/gu))
      expect(existsSync(join(root, "scripts", script!))).toBe(true);
    for (const [, job] of enforcedBy.matchAll(/\*\*([^*]+)\*\* job/gu))
      expect(workflows).toContain(`name: ${job}`);
    if (enforcedBy.includes("in `bun run check`")) {
      const script = /`bun scripts\/([\w-]+\.ts)`/u.exec(enforcedBy)![1]!;
      expect(scripts.check).toContain(`scripts/${script}`);
    }
  }
  expect(scripts.prepush).toContain("bun run check");
});

test("AGENTS.md labels every rule enforced or advisory and points at repository skills", () => {
  const agents = read("AGENTS.md");
  expect(agents).toContain("(.agents/skills/use-effect/SKILL.md)");
  expect(agents).toContain("(CONTRIBUTING.md#rules-and-their-checks)");
  const rules = agents.slice(
    agents.indexOf("## Editing rules"),
    agents.indexOf("<!-- CODEGRAPH_START -->"),
  );
  const bullets = rules.split("\n").filter((line) => line.startsWith("- "));
  expect(bullets.length).toBeGreaterThan(8);
  for (const bullet of bullets) expect(bullet).toMatch(/^- \*\*(?:Enforced|Advisory):\*\* /u);
});
