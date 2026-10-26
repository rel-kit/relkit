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
  event: "workflow_dispatch",
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
let result;
if (args.includes("POST")) {
  appendFileSync(new URL("../calls.jsonl", import.meta.url), JSON.stringify(args) + "\n");
  process.exit(state.dispatchFails ? 1 : 0);
} else if (args[1] === "graphql")
  result = { data: { repository: { release: state.complete ? { isDraft: false } : null } } };
else if (path.includes("/git/ref/")) result = { object: { sha: state.mainSha ?? state.sha } };
else if (path.includes("/actions/workflows/checks.yml"))
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
