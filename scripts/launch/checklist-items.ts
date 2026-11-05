/**
 * The launch checklist: the P0 items of the plan, the Railway newcomer test, the community channels
 * and the roadmap. Each item is `done` or `open` with the evidence behind it. Items about numbers
 * read the metrics report (`metrics.json`); items about files read the checkout; items about
 * GitHub read a state the caller fetched, and stay open when it could not be read.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { maturityProblems } from "../maturity.js";
import { POSITIONING, positioningMismatches, readLocalSurfaces } from "../positioning.js";
import type { MetricResult, MetricsReport } from "../metrics/types.js";

/** One checklist item. */
export interface ChecklistItem {
  readonly id: string;
  readonly group: "p0" | "railway" | "community" | "roadmap";
  readonly title: string;
  readonly status: "done" | "open";
  /** The evidence, or what is missing. */
  readonly detail: string;
}

/** What the repository looks like on GitHub, or undefined when it could not be read. */
export interface GitHubState {
  readonly hasDiscussionsEnabled: boolean;
  readonly description: string;
  readonly goodFirstIssues: number;
}

/** Fewest open `good first issue` issues that count as "about ten". */
export const MIN_GOOD_FIRST_ISSUES = 8;

const MAX_RAILWAY_SECONDS = 900;

function item(
  id: string,
  group: ChecklistItem["group"],
  title: string,
  done: boolean,
  detail: string,
): ChecklistItem {
  return { id, group, title, status: done ? "done" : "open", detail };
}

function metricItem(
  report: MetricsReport | undefined,
  metric: MetricResult["id"],
  id: string,
  group: ChecklistItem["group"],
  title: string,
): ChecklistItem {
  const found = report?.metrics.find((entry) => entry.id === metric);
  if (found === undefined) return item(id, group, title, false, "No metrics report was found.");
  return item(
    id,
    group,
    title,
    found.status === "met",
    `${found.name}: ${found.value} (target: ${found.target}).`,
  );
}

/**
 * Evaluates the checklist.
 * @param root - Repository root.
 * @param metrics - The metrics report, or undefined when there is none.
 * @param github - The repository's GitHub state, or undefined when it could not be read.
 * @returns Every item in checklist order.
 */
export async function evaluateChecklist(
  root: string,
  metrics: MetricsReport | undefined,
  github: GitHubState | undefined,
): Promise<ChecklistItem[]> {
  const exists = (path: string) => existsSync(join(root, path));
  const text = (path: string) => (exists(path) ? readFileSync(join(root, path), "utf8") : "");
  const mismatches = positioningMismatches(await readLocalSurfaces(root));
  const problems = maturityProblems(root);
  const unread = "GitHub could not be read.";
  const railway = metrics?.metrics.find((entry) => entry.id === "time-to-railway");
  return [
    metricItem(
      metrics,
      "creation-success",
      "p0-create",
      "p0",
      "P0 #1: create works on the latest Bun with every template",
    ),
    item(
      "p0-why-relkit",
      "p0",
      "P0 #2: a Why RelKit page and an FAQ",
      exists("apps/docs/content/docs/why-relkit.mdx") && exists("apps/docs/content/docs/faq.mdx"),
      "apps/docs/content/docs/why-relkit.mdx and faq.mdx.",
    ),
    item(
      "p0-plain-language",
      "p0",
      "P0 #3: plain language, one positioning sentence everywhere",
      exists("WRITING.md") && mismatches.length === 0,
      mismatches.length === 0
        ? "WRITING.md exists and every checked-in surface carries the positioning sentence."
        : `Surfaces that differ: ${mismatches.join(", ")}.`,
    ),
    item(
      "p0-standard-schema",
      "p0",
      "P0 #4: any Standard Schema validator works",
      exists("packages/relkit/tests/schema/third-party-projection.test.ts") &&
        text("apps/docs/content/docs/learn/concepts/schemas.mdx").includes("Standard Schema"),
      "The third-party projection suite exists and the schemas page documents it.",
    ),
    item(
      "p0-core-labs",
      "p0",
      "P0 #5: Core and Labs are published and consistent",
      exists("apps/docs/content/docs/maturity.mdx") && problems.length === 0,
      problems.length === 0
        ? "The maturity table agrees with manifests, tags and docs badges."
        : `${problems.length} disagreement(s); first: ${problems[0]}`,
    ),
    item(
      "railway-15-minutes",
      "railway",
      "A newcomer deploys to Railway in under 15 minutes",
      railway?.status === "met" && (railway.numeric ?? Infinity) < MAX_RAILWAY_SECONDS,
      railway === undefined
        ? "No metrics report was found."
        : `${railway.name}: ${railway.value} (target: ${railway.target}); ${railway.detail}`,
    ),
    item(
      "community-discussions",
      "community",
      "GitHub Discussions is enabled",
      github?.hasDiscussionsEnabled === true,
      github === undefined
        ? unread
        : github.hasDiscussionsEnabled
          ? "Discussions is enabled."
          : "Discussions is off.",
    ),
    item(
      "community-description",
      "community",
      "The repository description is the positioning sentence",
      github?.description === POSITIONING,
      github === undefined
        ? unread
        : github.description === POSITIONING
          ? "The description is the positioning sentence."
          : "The description differs from the positioning sentence.",
    ),
    item(
      "community-good-first-issues",
      "community",
      `About ten good first issues are labeled (at least ${MIN_GOOD_FIRST_ISSUES})`,
      (github?.goodFirstIssues ?? 0) >= MIN_GOOD_FIRST_ISSUES,
      github === undefined ? unread : `${github.goodFirstIssues} open issue(s) carry the label.`,
    ),
    item(
      "roadmap-published",
      "roadmap",
      "The roadmap page shows Core and Labs status",
      exists("apps/docs/content/docs/roadmap.mdx") &&
        text("apps/docs/content/docs/roadmap.mdx").includes("roadmap-status"),
      "apps/docs/content/docs/roadmap.mdx includes the generated status.",
    ),
  ];
}
