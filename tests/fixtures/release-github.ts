/** Fake gh executable: exposes controlled GitHub evidence and records follow-up dispatches for CLI tests. */
import { appendFileSync, readFileSync } from "node:fs";
import type { ReleaseFixtureState } from "./release-selection.types.js";

// The test owns this file and writes exactly ReleaseFixtureState before each invocation.
const state: ReleaseFixtureState = JSON.parse(
  readFileSync(new URL("../state.json", import.meta.url), "utf8"),
);
const args = process.argv.slice(2);
const path = args.at(-1)!;
const run = {
  id: 42,
  name: "Release",
  path: ".github/workflows/ci.yml",
  head_branch: "main",
  head_sha: state.executionSha ?? state.sha,
  event: state.previousEvent ?? "workflow_dispatch",
  status: "completed",
  conclusion: "failure",
  run_attempt: 1,
  head_repository: { full_name: "rel-kit/relkit" },
};
const ci = {
  ...run,
  id: 900,
  name: "CI",
  path: ".github/workflows/checks.yml",
  head_sha: state.ciSha ?? state.sha,
  event: "push",
  conclusion: "success",
};
const pulls = Object.entries(state.pullRuns ?? {});
const merged = pulls.find(([sha]) => path.includes(`/commits/${sha}/pulls`));
const pullRuns = pulls.find(([sha]) => path.includes(`event=pull_request&head_sha=${sha}`));
const recorded = pulls.find(([, pull]) => path.includes(`/runs/${pull.id}/artifacts`));
let result;
if (args.includes("POST")) {
  appendFileSync(new URL("../calls.jsonl", import.meta.url), JSON.stringify(args) + "\n");
  process.exit(state.dispatchFails ? 1 : 0);
} else if (args[1] === "graphql")
  result = { data: { repository: { release: state.complete ? { isDraft: false } : null } } };
else if (path.includes("/git/ref/")) result = { object: { sha: state.mainSha ?? state.sha } };
else if (path.includes("/commits/") && path.includes("/pulls"))
  result = merged
    ? [
        {
          merged_at: "2026-10-26T09:00:00Z",
          merge_commit_sha: merged[0],
          base: { ref: "main", repo: { full_name: "rel-kit/relkit" } },
          // The fixture reuses the merge commit as the pull request head.
          head: {
            sha: merged[0],
            repo: { full_name: merged[1].fork ? "fork/relkit" : "rel-kit/relkit" },
          },
        },
      ]
    : [];
else if (path.includes("/pulls?state=open"))
  result = state.releasePull
    ? [{ head: { ref: "changeset-release/main", sha: "d".repeat(40) } }]
    : [];
else if (path.includes("/compare/"))
  result = { ahead_by: 1, behind_by: state.releasePull === "current" ? 0 : 1 };
else if (path.includes("event=pull_request"))
  result = pullRuns
    ? {
        total_count: 1,
        workflow_runs: [
          {
            ...ci,
            id: pullRuns[1].id,
            head_branch: "feature",
            head_sha: pullRuns[0],
            event: "pull_request",
            conclusion: pullRuns[1].conclusion ?? "success",
          },
        ],
      }
    : { total_count: 0, workflow_runs: [] };
else if (recorded) {
  const name = `tested-tree-${recorded[1].tree}`;
  const found = path.includes(`name=${name}&`);
  result = {
    total_count: found ? 1 : 0,
    artifacts: found
      ? [
          {
            id: 456,
            name,
            expired: false,
            created_at: "2026-10-26T09:01:00Z",
            updated_at: "2026-10-26T09:01:00Z",
          },
        ]
      : [],
  };
} else if (path.includes("/actions/workflows/checks.yml"))
  result = { total_count: state.noCi ? 0 : 1, workflow_runs: state.noCi ? [] : [ci] };
else if (path.includes("/actions/workflows/ci.yml"))
  result = { total_count: state.previous ? 1 : 0, workflow_runs: state.previous ? [run] : [] };
else if (path.includes("/runs/900")) result = ci;
else if (path.includes("/jobs"))
  result = {
    total_count: 1,
    jobs: [
      {
        name: `Build validated npm artifacts (${state.sha})`,
        conclusion: "success",
        run_attempt: 1,
        started_at: "2026-10-26T10:00:00Z",
        completed_at: "2026-10-26T10:02:00Z",
      },
    ],
  };
else if (path.includes("/artifacts"))
  result = {
    total_count: state.missing ? 0 : 1,
    artifacts: state.missing
      ? []
      : [
          {
            id: 123,
            name: `npm-release-${state.sha}`,
            expired: !!state.expired,
            created_at: "2026-10-26T10:01:00Z",
            updated_at: "2026-10-26T10:01:00Z",
          },
        ],
  };
else result = run;
console.log(JSON.stringify(result));
