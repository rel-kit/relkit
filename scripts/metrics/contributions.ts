/**
 * Counts the issues and pull requests that people outside the organization opened in the last 30
 * days and writes a `relkit.contributions` result for the metrics report. It reads the repository
 * through `gh api` and writes nothing to GitHub; without credentials it writes no file, so the
 * metric shows "no data".
 *
 *   GH_TOKEN=... bun scripts/metrics/contributions.ts --repo rel-kit/relkit --output <file>
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { ContributionsResult } from "./types.js";

/** Fields of an issue or pull request in the issues API. */
export interface IssueRecord {
  readonly created_at: string;
  readonly author_association: string;
  readonly user: { readonly type: string } | null;
}

/** Associations that belong to the project, not to outside contributors. */
const INSIDERS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

/**
 * Counts outside contributions.
 * @param issues - Issues and pull requests created since the window started (the issues API lists both).
 * @param windowDays - Length of the window.
 * @param now - Current time.
 * @returns The result record.
 */
export function countOutsideContributions(
  issues: readonly IssueRecord[],
  windowDays: number,
  now: Date,
): ContributionsResult {
  const since = new Date(now.getTime() - windowDays * 86_400_000).toISOString();
  const count = issues.filter(
    (issue) =>
      issue.created_at >= since &&
      !INSIDERS.has(issue.author_association) &&
      issue.user?.type !== "Bot",
  ).length;
  return {
    protocol: "relkit.contributions",
    windowDays,
    count,
    since,
    createdAt: now.toISOString(),
  };
}

/**
 * Lists issues and pull requests through the GitHub CLI.
 * @param repo - `owner/name`.
 * @param since - ISO time to list from.
 * @returns The records, or undefined when `gh` fails (no credentials, no network).
 */
async function listIssues(repo: string, since: string): Promise<IssueRecord[] | undefined> {
  const child = Bun.spawn(
    [
      "gh",
      "api",
      "--paginate",
      "--slurp",
      `repos/${repo}/issues?state=all&since=${since}&per_page=100`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [code, output] = await Promise.all([child.exited, new Response(child.stdout).text()]);
  if (code !== 0) return undefined;
  return (JSON.parse(output) as IssueRecord[][]).flat();
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const value = (name: string) => args[args.indexOf(`--${name}`) + 1];
  const repo = value("repo");
  const output = value("output");
  if (repo === undefined || output === undefined)
    throw new Error("--repo and --output are required");
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const issues = await listIssues(repo, since);
  if (issues === undefined) console.log("Could not read the repository; the metric shows no data.");
  else {
    await mkdir(dirname(resolve(output)), { recursive: true });
    await writeFile(
      resolve(output),
      `${JSON.stringify(countOutsideContributions(issues, 30, now), undefined, 2)}\n`,
    );
  }
}
