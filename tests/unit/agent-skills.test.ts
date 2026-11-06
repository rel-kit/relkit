/** Keeps `.agents/skills` limited to skills for packages, tools and paths this repository uses. */
import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SKILL_USES, checkSkills } from "../../scripts/agent-skills.ts";

const root = resolve(import.meta.dir, "../..");
const fixture = await mkdtemp(join(tmpdir(), "relkit-skills-"));

afterAll(() => rm(fixture, { recursive: true, force: true }));

async function skill(name: string): Promise<void> {
  await mkdir(join(fixture, ".agents/skills", name), { recursive: true });
  await writeFile(join(fixture, ".agents/skills", name, "SKILL.md"), `---\nname: ${name}\n---\n`);
}

test("the repository passes", () => {
  expect(checkSkills(root)).toEqual([]);
  expect(Object.keys(SKILL_USES)).toContain("use-effect");
});

test("unlisted skills, unused dependencies and stale lock entries fail", async () => {
  await skill("hono");
  await skill("radix-base-ui-sync");
  await skill("pulumi-upgrade-provider");
  await writeFile(
    join(fixture, "skills-lock.json"),
    JSON.stringify({ version: 1, skills: { hono: {}, "add-lang": {} } }),
  );
  const problems = checkSkills(
    fixture,
    { hono: { dependency: "hono" }, "pulumi-upgrade-provider": { path: "provider" } },
    new Set(["effect"]),
  );
  expect(problems).toEqual([
    expect.stringContaining(".agents/skills/radix-base-ui-sync: not listed"),
    expect.stringContaining(".agents/skills/hono: applies to hono, which no workspace package"),
    expect.stringContaining(".agents/skills/pulumi-upgrade-provider: applies to provider"),
    expect.stringContaining("skills-lock.json: add-lang has no directory"),
  ]);
});
