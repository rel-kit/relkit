/** Exercises pending CI, terminal failure, wrong identities and bounded waiting at the release publication boundary. */
import { expect, test } from "bun:test";
import { verifyReleaseCi } from "../../scripts/release-ci-verification.ts";

const repository = "rel-kit/relkit";
const sha = "a".repeat(40);
const run = {
  id: 123,
  name: "CI",
  path: ".github/workflows/checks.yml",
  head_branch: "main",
  head_sha: sha,
  head_repository: { full_name: repository },
  event: "workflow_dispatch",
  status: "completed",
  conclusion: "success",
};

test("explicit release dispatch waits for actual CI completion", async () => {
  let reads = 0;
  let pauses = 0;
  await verifyReleaseCi(
    repository,
    sha,
    "123",
    async () => {
      reads++;
      return reads === 1 ? { ...run, status: "in_progress", conclusion: null } : run;
    },
    async () => {
      pauses++;
    },
  );
  expect(reads).toBe(2);
  expect(pauses).toBe(1);
});

test("pending or successful CI for another authority cannot admit publication", async () => {
  for (const invalid of [
    { ...run, id: 124 },
    { ...run, name: "Other CI" },
    { ...run, path: ".github/workflows/other.yml" },
    { ...run, head_branch: "changeset-release/main" },
    { ...run, head_sha: "b".repeat(40) },
    { ...run, head_repository: { full_name: "fork/relkit" } },
    { ...run, event: "pull_request" },
    { ...run, conclusion: "failure" },
    { ...run, conclusion: "cancelled" },
    { ...run, conclusion: null },
  ]) {
    let pauses = 0;
    await expect(
      verifyReleaseCi(
        repository,
        sha,
        "123",
        async () => invalid,
        async () => {
          pauses++;
        },
      ),
    ).rejects.toThrow();
    expect(pauses).toBe(0);
  }
});

test("CI waiting is bounded and never promotes an unfinished run", async () => {
  let pauses = 0;
  await expect(
    verifyReleaseCi(
      repository,
      sha,
      "123",
      async () => ({ ...run, status: "queued", conclusion: null }),
      async () => {
        pauses++;
      },
    ),
  ).rejects.toThrow("did not complete within five minutes");
  expect(pauses).toBe(59);
});

test("a slow API lookup cannot admit CI beyond the five-minute window", async () => {
  let elapsed = 0;
  await expect(
    verifyReleaseCi(
      repository,
      sha,
      "123",
      async () => {
        elapsed = 300_000;
        return run;
      },
      async () => {},
      () => elapsed,
    ),
  ).rejects.toThrow("did not complete within five minutes");
});

test("malformed caller identities are rejected before API access", async () => {
  for (const [repo, commit, id] of [
    ["bad/repo/path", sha, "123"],
    [repository, "bad", "123"],
    [repository, sha, "../123"],
  ]) {
    let reads = 0;
    await expect(
      verifyReleaseCi(repo!, commit!, id!, async () => {
        reads++;
        return run;
      }),
    ).rejects.toThrow();
    expect(reads).toBe(0);
  }
});
