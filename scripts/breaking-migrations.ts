/**
 * Release check: every breaking changeset must ship with an automated migration and a
 * migration note. A changeset is breaking when versioning would group it under Breaking
 * (`classifyChange`). Its summary must link a section of a migration guide under
 * `/guides/migrate/`, that section must exist in the guide page, and its anchor must be the
 * `guide` anchor of a `relkit migrate` rule, which is how a breaking change names the rule that
 * migrates it. `bun run check` runs it on `.changeset`.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { classifyChange } from "./version-packages.ts";

const root = resolve(import.meta.dirname, "..");
const link = /\]\((?:https:\/\/relkit\.dev)?(\/guides\/migrate\/[a-z0-9-]+)#([a-z0-9-]+)\)/g;

/** Where the check reads changesets, guide pages and rule anchors. */
export interface BreakingMigrationSources {
  readonly changesets: string;
  readonly guides: string;
  readonly ruleAnchors: ReadonlySet<string>;
}

/**
 * Lists every breaking changeset that lacks a migration rule or a migration guide section.
 * @param sources - Changeset folder, docs content folder and the rules' guide anchors.
 * @returns One problem line per failing changeset; empty when the release can version.
 */
export async function breakingMigrationProblems(sources: BreakingMigrationSources) {
  const problems: string[] = [];
  const names = (await readdir(sources.changesets)).filter(
    (name) => name.endsWith(".md") && name !== "README.md",
  );
  for (const name of names.sort()) {
    const text = await readFile(join(sources.changesets, name), "utf8");
    const parts = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
    if (parts === null) continue;
    const releases = [
      ...parts[1]!.matchAll(/^\s*"?([^":]+)"?\s*:\s*(major|minor|patch)\s*$/gm),
    ].map(([, release, type]) => ({ name: release!, type: type! }));
    let kind: string;
    try {
      kind = classifyChange({ summary: parts[2]!, releases }).kind;
    } catch {
      problems.push(`${name}: breaking change has no migration guide link.`);
      continue;
    }
    if (kind !== "Breaking") continue;
    const sections = [...parts[2]!.matchAll(link)];
    if (sections.length === 0) {
      problems.push(
        `${name}: link the migration guide section of this change (/guides/migrate/<page>#<section>).`,
      );
      continue;
    }
    for (const [, page, anchor] of sections) {
      if (!sources.ruleAnchors.has(anchor!))
        problems.push(`${name}: #${anchor} is not the guide section of any relkit migrate rule.`);
      const guide = await readFile(join(sources.guides, `${page}.mdx`), "utf8").catch(() => "");
      if (!guide.includes(`[#${anchor}]`))
        problems.push(`${name}: ${page}#${anchor} is not a section of the migration guide.`);
    }
  }
  return problems;
}

/**
 * Reads the `relkit migrate` rules' guide anchors from the CLI source. The path is computed, like
 * `performance.ts` loads package sources, because the workspace root does not depend on the CLI.
 * @returns Every rule's guide anchor.
 */
export async function ruleAnchors(): Promise<Set<string>> {
  const module = (await import(join(root, "packages/cli/src/migration/code-rules/index.ts"))) as {
    readonly codeRules: readonly { readonly guide: string }[];
  };
  return new Set(module.codeRules.map((rule) => rule.guide));
}

/**
 * Checks the repository's pending changesets against the real rules and guide.
 * @returns Nothing; sets a failing exit code and prints each problem.
 */
async function main(): Promise<void> {
  const problems = await breakingMigrationProblems({
    changesets: join(root, ".changeset"),
    guides: join(root, "apps/docs/content"),
    ruleAnchors: await ruleAnchors(),
  });
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) {
    console.error(`Breaking migration check failed with ${problems.length} problem(s).`);
    process.exitCode = 1;
  } else
    console.log(
      "Breaking migration check passed: every breaking change has a relkit migrate rule.",
    );
}

if (import.meta.main) await main();
