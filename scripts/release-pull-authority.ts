/** Lends a merged pull request's CI to the main commit it produced, only when that run recorded the same Git tree; anything less returns undefined and the release waits for main CI. */
import assert from "node:assert/strict";
import { Schema } from "effect";
import {
  CommitPulls,
  Comparison,
  OpenPulls,
  ReleaseArtifacts,
  ReleaseRuns,
} from "./release-automation.schemas.js";
import type { ReleaseApi } from "./release-automation.types.js";
import { RELEASE_BRANCH } from "./release-pr-scope.js";

/** Artifact name prefix under which CI records the Git tree a run checked out. */
export const TESTED_TREE_PREFIX = "tested-tree-";

const commit = /^[a-f0-9]{40}$/;

/**
 * Checks that a run uploaded the record naming this exact tree.
 * @param repository - Trusted repository context.
 * @param runId - Successful pull request CI run.
 * @param tree - Git tree of the main commit.
 * @param read - Bounded authenticated API adapter.
 * @returns Whether an unexpired record with the exact name exists.
 */
async function recordedTree(repository: string, runId: string, tree: string, read: ReleaseApi) {
  const name = `${TESTED_TREE_PREFIX}${tree}`;
  const result = Schema.decodeUnknownSync(Schema.fromJsonString(ReleaseArtifacts))(
    await read(`/repos/${repository}/actions/runs/${runId}/artifacts?name=${name}&per_page=100`),
  );
  assert.equal(result.total_count, result.artifacts.length, "Truncated tested tree history");
  return result.artifacts.some((artifact) => artifact.name === name && !artifact.expired);
}

/**
 * Finds the successful CI run of the pull request merged as this main commit that tested its tree.
 * @param repository - Trusted repository context.
 * @param sha - Main commit that needs verification.
 * @param tree - Git tree of that commit, read from the workflow checkout.
 * @param read - Bounded authenticated API adapter.
 * @param pause - Finite polling delay while the run is still completing; injectable for tests.
 * @returns The run ID, or undefined when the commit is not a same-repository merge or no run tested this tree.
 */
export async function pullRequestReleaseCi(
  repository: string,
  sha: string,
  tree: string,
  read: ReleaseApi,
  pause: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 5_000)),
): Promise<string | undefined> {
  assert.match(repository, /^[\w.-]+\/[\w.-]+$/);
  assert.match(sha, commit);
  assert.match(tree, commit);
  const pulls = Schema.decodeUnknownSync(Schema.fromJsonString(CommitPulls))(
    await read(`/repos/${repository}/commits/${sha}/pulls?per_page=100`),
  ).filter(
    (pull) =>
      pull.merged_at !== null &&
      pull.merge_commit_sha === sha &&
      pull.base.ref === "main" &&
      pull.base.repo.full_name === repository &&
      pull.head.repo?.full_name === repository,
  );
  if (pulls.length !== 1) return undefined;
  const head = pulls[0]!.head.sha;
  assert.match(head, commit);
  // The required check can pass seconds before GitHub marks the whole run completed.
  for (let attempt = 0; attempt < 36; attempt++) {
    const result = Schema.decodeUnknownSync(Schema.fromJsonString(ReleaseRuns))(
      await read(
        `/repos/${repository}/actions/workflows/checks.yml/runs?event=pull_request&head_sha=${head}&per_page=100`,
      ),
    );
    assert.equal(
      result.total_count,
      result.workflow_runs.length,
      "Truncated pull request CI history",
    );
    const runs = result.workflow_runs.filter(
      (run) =>
        run.name === "CI" &&
        run.path === ".github/workflows/checks.yml" &&
        run.event === "pull_request" &&
        run.head_sha === head &&
        run.head_repository.full_name === repository,
    );
    for (const run of runs)
      if (
        run.status === "completed" &&
        run.conclusion === "success" &&
        (await recordedTree(repository, String(run.id), tree, read))
      )
        return String(run.id);
    if (runs.every((run) => run.status === "completed")) return undefined;
    if (attempt < 35) await pause();
  }
  return undefined;
}

/**
 * Detects an open release pull request already versioned from this main commit.
 * @param repository - Trusted repository context.
 * @param head - Current main commit.
 * @param read - Bounded authenticated API adapter.
 * @returns True when versioning again would only replace the same candidate and restart its CI.
 */
export async function releasePullBuiltOn(repository: string, head: string, read: ReleaseApi) {
  assert.match(repository, /^[\w.-]+\/[\w.-]+$/);
  assert.match(head, commit);
  const owner = repository.split("/")[0];
  const pulls = Schema.decodeUnknownSync(Schema.fromJsonString(OpenPulls))(
    await read(
      `/repos/${repository}/pulls?state=open&base=main&head=${owner}:${RELEASE_BRANCH}&per_page=100`,
    ),
  );
  for (const pull of pulls) {
    if (pull.head.ref !== RELEASE_BRANCH) continue;
    assert.match(pull.head.sha, commit);
    const comparison = Schema.decodeUnknownSync(Schema.fromJsonString(Comparison))(
      await read(`/repos/${repository}/compare/${head}...${pull.head.sha}`),
    );
    if (comparison.behind_by === 0 && comparison.ahead_by > 0) return true;
  }
  return false;
}
