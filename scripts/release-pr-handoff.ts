import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

type WorkflowRun = {
  head_branch: string;
  head_sha: string;
  head_repository: { full_name: string };
  event: string;
  conclusion: string;
};
type PullRequest = {
  number: number;
  state: string;
  merged: boolean;
  merge_commit_sha: string | null;
  head: { sha: string; ref: string; repo: { full_name: string } };
  base: { ref: string; repo: { full_name: string } };
};
type Api = (path: string, body?: Record<string, string>) => Promise<unknown>;

/** Dispatches main CI after the exact reviewed release PR merges, independently of versioning. */
export async function handoffRelease(
  repository: string,
  run: WorkflowRun,
  api: Api,
  pause: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 5_000)),
): Promise<string> {
  assert.equal(run.conclusion, "success");
  assert.equal(run.head_repository.full_name, repository);
  assert.equal(run.head_branch, "changeset-release/main");
  assert.ok(["pull_request", "workflow_dispatch"].includes(run.event));
  assert.match(run.head_sha, /^[a-f0-9]{40}$/);
  const prefix = `/repos/${repository}`;
  const query = new URLSearchParams({
    state: "all",
    head: `${repository.split("/")[0]}:changeset-release/main`,
    base: "main",
    per_page: "100",
  });
  const pulls = (await api(`${prefix}/pulls?${query}`)) as PullRequest[];
  const candidate = pulls.find(
    (pr) =>
      pr.head.sha === run.head_sha &&
      pr.head.ref === run.head_branch &&
      pr.head.repo.full_name === repository &&
      pr.base.ref === "main" &&
      pr.base.repo.full_name === repository,
  );
  if (candidate === undefined) return "no matching release PR";
  for (let attempt = 0; attempt < 60; attempt++) {
    const pr = (await api(`${prefix}/pulls/${candidate.number}`)) as PullRequest;
    if (pr.head.sha !== run.head_sha) return "release PR changed; await its new CI";
    if (pr.merged) {
      assert.match(pr.merge_commit_sha ?? "", /^[a-f0-9]{40}$/);
      const main = (await api(`${prefix}/git/ref/heads/main`)) as { object: { sha: string } };
      if (main.object.sha !== pr.merge_commit_sha) return "main advanced beyond this release PR";
      const existing = (await api(
        `${prefix}/actions/workflows/checks.yml/runs?head_sha=${pr.merge_commit_sha}&branch=main&per_page=100`,
      )) as { workflow_runs: WorkflowRun[] };
      if (
        existing.workflow_runs.some(
          (item) =>
            item.head_sha === pr.merge_commit_sha &&
            item.head_branch === "main" &&
            item.head_repository.full_name === repository &&
            ["push", "workflow_dispatch"].includes(item.event),
        )
      )
        return "main CI already exists";
      await api(`${prefix}/actions/workflows/checks.yml/dispatches`, { ref: "main" });
      return `dispatched main CI for ${pr.merge_commit_sha}`;
    }
    if (pr.state !== "open") return "release PR closed without merging";
    if (attempt < 59) await pause();
  }
  throw new Error(`Release PR #${candidate.number} did not merge within five minutes`);
}

if (import.meta.main) {
  const repository = process.env.GITHUB_REPOSITORY;
  assert.ok(repository && /^[\w.-]+\/[\w.-]+$/.test(repository));
  assert.ok(process.env.RELEASE_WORKFLOW_RUN);
  const run = JSON.parse(process.env.RELEASE_WORKFLOW_RUN) as WorkflowRun;
  const execute = promisify(execFile);
  const api: Api = async (path, body) => {
    const args = ["api", "--hostname", "github.com", path];
    if (body !== undefined) {
      args.push("--method", "POST");
      for (const [key, value] of Object.entries(body)) args.push("--raw-field", `${key}=${value}`);
    }
    const { stdout } = await execute("gh", args, {
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
      encoding: "utf8",
    });
    return stdout.trim() === "" ? undefined : JSON.parse(stdout);
  };
  console.log(await handoffRelease(repository, run, api));
}
