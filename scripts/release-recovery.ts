import assert from "node:assert/strict";

type Api = (path: string) => Promise<unknown>;

/** Re-running successful CI must reuse a previous pack instead of rebuilding published versions. */
export async function findReleaseRecovery(
  repository: string,
  sha: string,
  currentRun: string,
  read: Api,
) {
  const result = (await read(
    `/repos/${repository}/actions/workflows/ci.yml/runs?branch=main&head_sha=${sha}&per_page=100`,
  )) as {
    workflow_runs: { id: number; head_sha: string; status: string }[];
  };
  for (const run of result.workflow_runs) {
    if (String(run.id) === currentRun || run.head_sha !== sha || run.status !== "completed")
      continue;
    const jobs = (await read(
      `/repos/${repository}/actions/runs/${run.id}/jobs?filter=all&per_page=100`,
    )) as {
      jobs: { name: string; conclusion: string }[];
    };
    if (
      jobs.jobs.some(
        (job) => job.name === "Build validated npm artifacts" && job.conclusion === "success",
      )
    )
      return recoverRelease(repository, String(run.id), read);
  }
  return undefined;
}

/** Admit only immutable archives produced by a completed, trusted main release's successful pack job. */
export async function recoverRelease(repository: string, runId: string, read: Api) {
  assert.match(runId, /^[1-9]\d*$/);
  const prefix = `/repos/${repository}/actions`;
  const run = (await read(`${prefix}/runs/${runId}`)) as {
    path: string;
    head_branch: string;
    head_sha: string;
    event: string;
    status: string;
    head_repository: { full_name: string };
  };
  assert.equal(run.path, ".github/workflows/ci.yml");
  assert.equal(run.head_branch, "main");
  assert.equal(run.head_repository.full_name, repository);
  assert.equal(run.status, "completed");
  assert.ok(["workflow_run", "workflow_dispatch"].includes(run.event));
  assert.match(run.head_sha, /^[a-f0-9]{40}$/);
  const jobs = (await read(`${prefix}/runs/${runId}/jobs?filter=all&per_page=100`)) as {
    jobs: { name: string; conclusion: string }[];
  };
  assert.ok(
    jobs.jobs.some(
      (job) => job.name === "Build validated npm artifacts" && job.conclusion === "success",
    ),
    "Source release did not successfully validate artifacts",
  );
  const artifacts = (await read(`${prefix}/runs/${runId}/artifacts?per_page=100`)) as {
    artifacts: { id: number; name: string; expired: boolean }[];
  };
  const candidates = artifacts.artifacts.filter(
    (item) => item.name === `npm-release-${run.head_sha}` && !item.expired,
  );
  assert.equal(
    candidates.length,
    1,
    "Original release archives are missing, expired, or ambiguous; never rebuild an immutable version",
  );
  return { sha: run.head_sha, artifactId: String(candidates[0]!.id), runId };
}
