/**
 * Keeps `.agents/skills` limited to skills for packages, tools or services this repository uses.
 * Each skill is listed in {@link SKILL_USES} with the dependency it applies to (declared in a
 * workspace `package.json`) or the repository path it works on. A skill without an entry, an entry
 * whose dependency or path is gone, and a `skills-lock.json` entry without a skill all fail.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { repositoryFiles } from "./repository-hygiene";

/** What a skill applies to: a declared dependency or a repository path. */
export type SkillUse = { readonly dependency: string } | { readonly path: string };

/** Every skill under `.agents/skills` and what it applies to. */
export const SKILL_USES: Readonly<Record<string, SkillUse>> = {
  blume: { dependency: "blume" },
  "clean-code": { dependency: "typescript" },
  "code-review": { dependency: "typescript" },
  "design-patterns": { dependency: "typescript" },
  "documentation-writer": { path: "apps/docs" },
  effect: { dependency: "effect" },
  hono: { dependency: "hono" },
  "konsistent-config": { dependency: "konsistent" },
  "konsistent-fix-violations": { dependency: "konsistent" },
  "minimalist-ui": { dependency: "react" },
  opentelemetry: { dependency: "@opentelemetry/api" },
  "relkit-app": { path: "templates/default/v1" },
  "relkit-deploy": { path: "integrations/packages/pulumi" },
  streamdown: { dependency: "streamdown" },
  turborepo: { dependency: "turbo" },
  "typescript-async-patterns": { dependency: "typescript" },
  "typescript-pro": { dependency: "typescript" },
  "ui-taste": { dependency: "react" },
  "use-effect": { dependency: "effect" },
  vitest: { dependency: "vitest" },
};

const SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
  "catalog",
] as const;

/**
 * Collects every dependency name declared by a tracked workspace manifest.
 * @param root - Repository root.
 * @returns Declared package names.
 */
export function declaredDependencies(root: string): Set<string> {
  const names = new Set<string>();
  for (const file of repositoryFiles(root)) {
    if (!file.endsWith("package.json") || file.startsWith("openspec/")) continue;
    const manifest = JSON.parse(readFileSync(join(root, file), "utf8")) as Record<
      string,
      Record<string, unknown> | undefined
    >;
    for (const section of SECTIONS)
      for (const name of Object.keys(manifest[section] ?? {})) names.add(name);
  }
  return names;
}

/**
 * Checks the skills directory against {@link SKILL_USES} and `skills-lock.json`.
 * @param root - Repository root.
 * @param uses - Skill table; tests pass fixtures.
 * @param dependencies - Declared dependency names.
 * @returns One message per problem.
 */
export function checkSkills(
  root: string,
  uses: Readonly<Record<string, SkillUse>> = SKILL_USES,
  dependencies: ReadonlySet<string> = declaredDependencies(root),
): string[] {
  const directory = join(root, ".agents/skills");
  const skills = existsSync(directory)
    ? readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];
  const problems: string[] = [];
  for (const skill of skills)
    if (!(skill in uses))
      problems.push(
        `.agents/skills/${skill}: not listed in scripts/agent-skills.ts; list what it applies to or remove it.`,
      );
  for (const [skill, use] of Object.entries(uses)) {
    if (!skills.includes(skill)) {
      problems.push(`.agents/skills/${skill}: listed in scripts/agent-skills.ts but missing.`);
      continue;
    }
    if ("dependency" in use && !dependencies.has(use.dependency))
      problems.push(
        `.agents/skills/${skill}: applies to ${use.dependency}, which no workspace package declares.`,
      );
    if ("path" in use && !existsSync(join(root, use.path)))
      problems.push(`.agents/skills/${skill}: applies to ${use.path}, which does not exist.`);
  }
  const lockPath = join(root, "skills-lock.json");
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { skills?: object };
    for (const skill of Object.keys(lock.skills ?? {}))
      if (!skills.includes(skill))
        problems.push(`skills-lock.json: ${skill} has no directory under .agents/skills.`);
  }
  return problems;
}

if (import.meta.main) {
  const problems = checkSkills(resolve(import.meta.dir, ".."));
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) {
    console.error(`Agent skills check failed with ${problems.length} problem(s).`);
    process.exitCode = 1;
  } else console.log(`Agent skills check passed (${Object.keys(SKILL_USES).length} skills).`);
}
