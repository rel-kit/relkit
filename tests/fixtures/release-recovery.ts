/** Complete GitHub run, attempt, job and artifact records for recovery authority tests. */
const sha = "a".repeat(40);

/**
 * Supplies mutable owned evidence and a JSON API adapter, with legacy pack naming by default.
 * @returns Independent records so tests can corrupt each authority boundary.
 */
export function recoveryFixture() {
  const run = {
    id: 42,
    name: "Release",
    path: ".github/workflows/ci.yml",
    head_branch: "main",
    head_sha: sha,
    event: "workflow_dispatch",
    status: "completed",
    conclusion: "failure",
    run_attempt: 1,
    head_repository: { full_name: "rel-kit/relkit" },
  };
  const attempt = { ...run, head_repository: { ...run.head_repository } };
  const jobs = {
    total_count: 1,
    jobs: [
      {
        name: "Build validated npm artifacts",
        conclusion: "success",
        run_attempt: 1,
        started_at: "2026-10-26T10:00:00Z",
        completed_at: "2026-10-26T10:02:00Z",
      },
    ],
  };
  const artifacts = {
    total_count: 1,
    artifacts: [
      {
        id: 123,
        name: `npm-release-${sha}`,
        expired: false,
        created_at: "2026-10-26T10:01:00Z",
        updated_at: "2026-10-26T10:01:00Z",
      },
    ],
  };
  const requests: string[] = [];
  const read = async (path: string) => {
    requests.push(path);
    if (path.includes("/actions/workflows/"))
      return JSON.stringify({ total_count: 1, workflow_runs: [run] });
    if (path.includes("/jobs")) return JSON.stringify(jobs);
    if (path.includes("/artifacts")) return JSON.stringify(artifacts);
    if (path.includes("/attempts/")) return JSON.stringify(attempt);
    return JSON.stringify(run);
  };
  return { sha, run, attempt, jobs, artifacts, requests, read };
}
