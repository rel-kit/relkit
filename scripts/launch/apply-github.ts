/**
 * Applies the community launch settings to the GitHub repository through `gh`: enables Discussions,
 * sets the repository description, creates the labels the good first issues need and creates the
 * issues from `good-first-issues.md`. It is idempotent (existing labels and issues are skipped).
 *
 * It defaults to a DRY RUN: it reads the repository to say what is missing and prints each
 * change it would make, and writes nothing. Only the maintainer decides when the launch goes live;
 * pass `--apply` to make the changes.
 *
 *   bun scripts/launch/apply-github.ts [--repo rel-kit/relkit]          dry run
 *   bun scripts/launch/apply-github.ts [--repo rel-kit/relkit] --apply  make the changes
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { POSITIONING } from "../positioning.js";

const here = import.meta.dir;

/** One drafted issue. */
export interface IssueDraft {
  readonly title: string;
  readonly labels: readonly string[];
  readonly body: string;
}

/** Labels the drafts use, with the colors and descriptions to create them with. */
export const LABELS: readonly { name: string; color: string; description: string }[] = [
  { name: "good first issue", color: "7057ff", description: "Good for newcomers" },
  { name: "help wanted", color: "008672", description: "Extra attention is needed" },
  {
    name: "documentation",
    color: "0075ca",
    description: "Improvements or additions to documentation",
  },
  { name: "bug", color: "d73a4a", description: "Something isn't working" },
];

/** Existing issues that also get the `good first issue` label. */
export const EXISTING_GOOD_FIRST_ISSUES: readonly number[] = [174];

/** Runs `gh`: reads always run, writes only when applying. */
export interface GitHub {
  /** Runs a read-only `gh` command. @param args - Arguments. @returns Standard output. */
  read(args: readonly string[]): Promise<string>;
  /** Runs, or in a dry run only prints, a `gh` command that changes GitHub. @param args - Arguments. */
  write(args: readonly string[]): Promise<void>;
}

/**
 * Parses the issue drafts.
 * @param markdown - Contents of `good-first-issues.md`.
 * @returns One draft per `##` heading, with its `Labels:` line and body.
 */
export function parseDrafts(markdown: string): IssueDraft[] {
  return markdown
    .split(/^## /mu)
    .slice(1)
    .map((section) => {
      const [title = "", ...rest] = section.split("\n");
      const text = rest.join("\n").trim();
      const match = /^Labels: (.+)\n\n?/u.exec(text);
      if (match?.[1] === undefined) throw new Error(`Draft "${title}" has no Labels: line.`);
      return {
        title: title.trim(),
        labels: match[1].split(",").map((label) => label.trim()),
        body: text.slice(match[0].length).trim(),
      };
    });
}

/**
 * Runs every launch step against a repository.
 * @param github - Reads and writes.
 * @param repo - `owner/name`.
 * @param drafts - Issue drafts.
 * @param description - Repository description to set.
 * @returns Counts of changes made (or that would be made).
 */
export async function applyLaunch(
  github: GitHub,
  repo: string,
  drafts: readonly IssueDraft[],
  description: string,
): Promise<{ readonly changes: number }> {
  let changes = 0;
  const write = async (args: readonly string[]) => {
    changes += 1;
    await github.write(args);
  };
  const state = JSON.parse(
    await github.read(["repo", "view", repo, "--json", "description,hasDiscussionsEnabled"]),
  ) as { description: string; hasDiscussionsEnabled: boolean };
  if (!state.hasDiscussionsEnabled) await write(["repo", "edit", repo, "--enable-discussions"]);
  else console.log("Discussions is already enabled.");
  if (state.description !== description)
    await write(["repo", "edit", repo, "--description", description]);
  else console.log("The repository description is already set.");

  const labels = (
    JSON.parse(
      await github.read(["label", "list", "--repo", repo, "--json", "name", "--limit", "200"]),
    ) as {
      name: string;
    }[]
  ).map(({ name }) => name);
  for (const label of LABELS)
    if (!labels.includes(label.name))
      await write([
        "label",
        "create",
        label.name,
        "--repo",
        repo,
        "--color",
        label.color,
        "--description",
        label.description,
      ]);
  const used = new Set(drafts.flatMap((draft) => draft.labels));
  for (const label of used)
    if (!LABELS.some(({ name }) => name === label))
      throw new Error(`Draft label "${label}" is not in LABELS.`);

  const titles = (
    JSON.parse(
      await github.read([
        "issue",
        "list",
        "--repo",
        repo,
        "--state",
        "all",
        "--json",
        "title",
        "--limit",
        "500",
      ]),
    ) as { title: string }[]
  ).map(({ title }) => title);
  for (const draft of drafts) {
    if (titles.includes(draft.title)) {
      console.log(`Issue exists, skipped: ${draft.title}`);
      continue;
    }
    await write([
      "issue",
      "create",
      "--repo",
      repo,
      "--title",
      draft.title,
      "--body",
      draft.body,
      ...draft.labels.flatMap((label) => ["--label", label]),
    ]);
  }
  for (const number of EXISTING_GOOD_FIRST_ISSUES)
    await write([
      "issue",
      "edit",
      String(number),
      "--repo",
      repo,
      "--add-label",
      "good first issue",
    ]);
  return { changes };
}

/**
 * Builds the `gh` runner.
 * @param apply - Whether writes run.
 * @returns A runner that prints writes in a dry run.
 */
function ghRunner(apply: boolean): GitHub {
  const run = async (args: readonly string[]) => {
    const child = Bun.spawn(["gh", ...args], { stdout: "pipe", stderr: "inherit" });
    const [code, output] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    if (code !== 0) throw new Error(`gh ${args.slice(0, 2).join(" ")} failed (${code})`);
    return output;
  };
  return {
    read: run,
    write: async (args) => {
      const shown = `gh ${args
        .map((arg, position) => {
          const text =
            args[position - 1] === "--body" && arg.length > 60 ? `${arg.slice(0, 57)}...` : arg;
          return /^[\w./:=,-]+$/u.test(text) ? text : JSON.stringify(text);
        })
        .join(" ")}`;
      if (!apply) console.log(`[dry run] would run: ${shown}`);
      else {
        console.log(`running: ${shown}`);
        await run(args);
      }
    },
  };
}

if (import.meta.main) {
  const index = process.argv.indexOf("--repo");
  const repo = index < 0 ? "rel-kit/relkit" : (process.argv[index + 1] ?? "");
  const apply = process.argv.includes("--apply");
  const description = readFileSync(join(here, "repository-description.txt"), "utf8").trim();
  if (description !== POSITIONING)
    throw new Error("repository-description.txt differs from the positioning sentence.");
  const drafts = parseDrafts(readFileSync(resolve(here, "good-first-issues.md"), "utf8"));
  console.log(
    apply
      ? `Applying the launch settings to ${repo}.`
      : `Dry run for ${repo}: nothing will change. Pass --apply to make the changes.`,
  );
  const { changes } = await applyLaunch(ghRunner(apply), repo, drafts, description);
  console.log(`${apply ? "Made" : "Would make"} ${changes} change(s).`);
}
