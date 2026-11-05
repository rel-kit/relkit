/**
 * The launch checklist as a check. It reads the metrics report (`metrics.json`, see
 * `scripts/metrics.ts`), the checkout and, with `--github`, the repository's GitHub state, and
 * reports every item as done or open.
 *
 *   bun scripts/launch/checklist.ts --metrics test-results/metrics/metrics.json [--github]
 *   bun scripts/launch/checklist.ts --metrics ... --strict
 *
 * Two modes. The default is the report mode that runs on every pull request: it lists the open items
 * and exits 0, because before launch most community items are open by design. `--strict` is the
 * launch gate: it exits 1 while any item is open. The maintainer runs it (the `Plan metrics` workflow
 * has a `strict` input) before announcing the launch; ordinary releases do not run it.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateChecklist, type ChecklistItem, type GitHubState } from "./checklist-items.js";
import { readMetricsReport } from "../metrics/render.js";

const root = resolve(import.meta.dir, "../..");

/**
 * Renders the checklist.
 * @param items - Evaluated items.
 * @param strict - Whether open items fail the run.
 * @returns Markdown with a line per item and a verdict.
 */
export function checklistMarkdown(items: readonly ChecklistItem[], strict: boolean): string {
  const open = items.filter((entry) => entry.status === "open");
  const lines = items.map(
    (entry) => `- [${entry.status === "done" ? "x" : " "}] ${entry.title}: ${entry.detail}`,
  );
  const verdict =
    open.length === 0
      ? "Every launch checklist item is done."
      : strict
        ? `Strict mode: ${open.length} of ${items.length} items are open, so the launch is blocked.`
        : `Report mode: ${open.length} of ${items.length} items are open; this does not fail the run.`;
  return `## Launch checklist\n\n${lines.join("\n")}\n\n${verdict}\n`;
}

/**
 * Reads the repository's state through `gh` (read-only).
 * @returns The state, or undefined when `gh` is unavailable or not signed in.
 */
async function readGitHubState(): Promise<GitHubState | undefined> {
  const gh = async (args: readonly string[]) => {
    const child = Bun.spawn(["gh", ...args], { stdout: "pipe", stderr: "ignore" });
    const [code, output] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    if (code !== 0) throw new Error(`gh ${args[0]} failed`);
    return output;
  };
  try {
    const repo = JSON.parse(
      await gh(["repo", "view", "--json", "description,hasDiscussionsEnabled"]),
    ) as { description: string; hasDiscussionsEnabled: boolean };
    const issues = JSON.parse(
      await gh([
        "issue",
        "list",
        "--label",
        "good first issue",
        "--state",
        "open",
        "--json",
        "number",
        "--limit",
        "100",
      ]),
    ) as unknown[];
    return { ...repo, goodFirstIssues: issues.length };
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const flag = process.argv.indexOf("--metrics");
  const metricsPath = flag < 0 ? undefined : resolve(process.argv[flag + 1] ?? "");
  const strict = process.argv.includes("--strict");
  const metrics =
    metricsPath !== undefined && existsSync(metricsPath)
      ? readMetricsReport(metricsPath)
      : undefined;
  const github = process.argv.includes("--github") ? await readGitHubState() : undefined;
  const items = await evaluateChecklist(root, metrics, github);
  if (process.argv.includes("--json")) console.log(JSON.stringify(items, undefined, 2));
  else console.log(checklistMarkdown(items, strict));
  if (strict && items.some((entry) => entry.status === "open")) process.exitCode = 1;
}

if (import.meta.main) await main();
