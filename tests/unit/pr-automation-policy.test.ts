/** Tests the privileged admission boundary independently of GitHub credentials, including stale runs and untrusted output paths. */
import { expect, test } from "bun:test";
import {
  admitDependencyBundle,
  admitPreparation,
  preparationCommit,
} from "../../scripts/pr-automation-policy.ts";

const repository = "rel-kit/relkit";
const head = "a".repeat(40);
const branch = { sha: head, ref: "dependabot/npm/security", repo: { full_name: repository } };
const pull = {
  number: 139,
  title: "Update dependencies",
  state: "open",
  user: { login: "dependabot[bot]" },
  head: branch,
  base: { ...branch, ref: "main" },
};
const run = {
  id: 1,
  run_attempt: 1,
  name: "CI",
  path: ".github/workflows/checks.yml",
  event: "pull_request",
  status: "completed",
  conclusion: "failure",
  head_sha: head,
  head_repository: { full_name: repository },
};

test("failed PR CI may be repaired, but stale heads, forks and other workflows are rejected", () => {
  expect(() => admitPreparation(repository, run, pull)).not.toThrow();
  for (const invalid of [
    { ...pull, head: { ...branch, sha: "b".repeat(40) } },
    { ...pull, head: { ...branch, repo: { full_name: "other/fork" } } },
    { ...pull, state: "closed" },
    { ...pull, head: { ...branch, ref: "main" } },
    { ...pull, head: { ...branch, ref: "changeset-release/main" } },
  ])
    expect(() => admitPreparation(repository, run, invalid)).toThrow();
  for (const invalid of [
    { ...run, path: ".github/workflows/other.yml" },
    { ...run, event: "push" },
    { ...run, status: "in_progress" },
    { ...run, conclusion: "cancelled" },
  ])
    expect(() => admitPreparation(repository, invalid, pull)).toThrow();
});

test("dependency artifacts cannot write workflows, new paths, duplicate paths or another head", () => {
  const bundle = { repository, head, files: [{ path: "bun.lock", content: "lock data" }] };
  const tracked = new Set(["bun.lock", ".github/workflows/checks.yml"]);
  expect(admitDependencyBundle(bundle, repository, head, tracked)).toEqual(bundle.files);
  for (const invalid of [
    { ...bundle, repository: "other/repository" },
    { ...bundle, head: "b".repeat(40) },
    { ...bundle, files: [{ path: ".github/workflows/checks.yml", content: "code" }] },
    { ...bundle, files: [{ path: "../package.json", content: "{}" }] },
    { ...bundle, files: [...bundle.files, ...bundle.files] },
  ])
    expect(() => admitDependencyBundle(invalid, repository, head, tracked)).toThrow();
});

test("a commit uses an exact-head lease and keeps untrusted content in base64 data", () => {
  const content = "$(touch /tmp/should-never-execute)";
  const request = preparationCommit(repository, pull, [{ path: ".changeset/auto.md", content }]);
  expect(request.variables.input.expectedHeadOid).toBe(head);
  expect(request.variables.input.branch).toEqual({
    repositoryNameWithOwner: repository,
    branchName: branch.ref,
  });
  expect(
    Buffer.from(request.variables.input.fileChanges.additions[0]!.contents, "base64").toString(),
  ).toBe(content);
  expect(() => preparationCommit(repository, pull, [])).toThrow();
});
