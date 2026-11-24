/** Exercises which pull request CI runs may verify a main commit, the bounded wait for a completing run, and the versioning lease. */
import { expect, test } from "bun:test";
import { pullRequestReleaseCi, releasePullBuiltOn } from "../../scripts/release-pull-authority.ts";

const repository = "rel-kit/relkit";
const sha = "a".repeat(40);
const head = "c".repeat(40);
const tree = "e".repeat(40);
const pull = {
  merged_at: "2026-10-26T09:00:00Z",
  merge_commit_sha: sha,
  base: { ref: "main", repo: { full_name: repository } },
  head: { sha: head, repo: { full_name: repository } },
};
const run = {
  id: 901,
  name: "CI",
  path: ".github/workflows/checks.yml",
  head_branch: "feature",
  head_sha: head,
  head_repository: { full_name: repository },
  event: "pull_request",
  status: "completed",
  conclusion: "success",
  run_attempt: 1,
};
const record = {
  id: 456,
  name: `tested-tree-${tree}`,
  expired: false,
  created_at: "2026-10-26T09:01:00Z",
  updated_at: "2026-10-26T09:01:00Z",
};

/** Serves one pull request, its runs and the tree records of run 901. */
function github(
  pulls: readonly unknown[],
  runs: (read: number) => readonly unknown[],
  records: readonly unknown[] = [record],
) {
  let reads = 0;
  return async (path: string) => {
    if (path.includes("/pulls")) return JSON.stringify(pulls);
    if (path.includes("/artifacts")) {
      const found = records.filter((item) =>
        path.includes(`name=${(item as { name: string }).name}&`),
      );
      return JSON.stringify({ total_count: found.length, artifacts: found });
    }
    const current = runs(reads++);
    return JSON.stringify({ total_count: current.length, workflow_runs: current });
  };
}

test("a successful run of the merged pull request verifies the commit only with the same tree", async () => {
  const read = github([pull], () => [run]);
  expect(await pullRequestReleaseCi(repository, sha, tree, read)).toBe("901");
  expect(await pullRequestReleaseCi(repository, sha, "f".repeat(40), read)).toBeUndefined();
  const expired = github([pull], () => [run], [{ ...record, expired: true }]);
  expect(await pullRequestReleaseCi(repository, sha, tree, expired)).toBeUndefined();
});

test("another pull request, base, repository, workflow or conclusion cannot verify the commit", async () => {
  for (const pulls of [
    [],
    [pull, pull],
    [{ ...pull, merged_at: null }],
    [{ ...pull, merge_commit_sha: "b".repeat(40) }],
    [{ ...pull, base: { ...pull.base, ref: "next" } }],
    [{ ...pull, base: { ref: "main", repo: { full_name: "fork/relkit" } } }],
    [{ ...pull, head: { sha: head, repo: { full_name: "fork/relkit" } } }],
    [{ ...pull, head: { sha: head, repo: null } }],
  ])
    expect(
      await pullRequestReleaseCi(
        repository,
        sha,
        tree,
        github(pulls, () => [run]),
      ),
    ).toBeUndefined();
  for (const invalid of [
    { ...run, name: "Other CI" },
    { ...run, path: ".github/workflows/other.yml" },
    { ...run, event: "push" },
    { ...run, head_sha: "b".repeat(40) },
    { ...run, head_repository: { full_name: "fork/relkit" } },
    { ...run, conclusion: "failure" },
    { ...run, conclusion: "cancelled" },
  ]) {
    let pauses = 0;
    expect(
      await pullRequestReleaseCi(
        repository,
        sha,
        tree,
        github([pull], () => [invalid]),
        async () => {
          pauses++;
        },
      ),
    ).toBeUndefined();
    expect(pauses).toBe(0);
  }
});

test("a run still completing is awaited for a bounded time and never promoted unfinished", async () => {
  const pending = { ...run, status: "in_progress", conclusion: null };
  let pauses = 0;
  const pause = async () => {
    pauses++;
  };
  const finishing = github([pull], (read) => [read < 2 ? pending : run]);
  expect(await pullRequestReleaseCi(repository, sha, tree, finishing, pause)).toBe("901");
  expect(pauses).toBe(2);
  pauses = 0;
  const stuck = github([pull], () => [pending]);
  expect(await pullRequestReleaseCi(repository, sha, tree, stuck, pause)).toBeUndefined();
  expect(pauses).toBe(35);
});

test("truncated run or record listings fail instead of reading as absent", async () => {
  const truncated = async (path: string) =>
    path.includes("/pulls")
      ? JSON.stringify([pull])
      : JSON.stringify({ total_count: 101, workflow_runs: [run], artifacts: [] });
  await expect(pullRequestReleaseCi(repository, sha, tree, truncated)).rejects.toThrow("Truncated");
});

test("only an open release pull request that contains the main commit holds the versioning lease", async () => {
  const release = { head: { ref: "changeset-release/main", sha: "d".repeat(40) } };
  const github = (pulls: readonly unknown[], comparison: object) => async (path: string) =>
    JSON.stringify(path.includes("/compare/") ? comparison : pulls);
  const current = { ahead_by: 1, behind_by: 0 };
  expect(await releasePullBuiltOn(repository, sha, github([release], current))).toBe(true);
  expect(await releasePullBuiltOn(repository, sha, github([], current))).toBe(false);
  expect(
    await releasePullBuiltOn(repository, sha, github([release], { ahead_by: 1, behind_by: 2 })),
  ).toBe(false);
  expect(
    await releasePullBuiltOn(repository, sha, github([release], { ahead_by: 0, behind_by: 0 })),
  ).toBe(false);
  const other = { head: { ref: "changeset-release/main-old", sha: "d".repeat(40) } };
  expect(await releasePullBuiltOn(repository, sha, github([other], current))).toBe(false);
});
