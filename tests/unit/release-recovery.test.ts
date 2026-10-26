/** Verifies source identity, original attempt ownership, complete history and immutable archive refusal. */
import { expect, test } from "bun:test";
import { findReleaseRecovery, recoverRelease } from "../../scripts/release-recovery.js";
import { recoveryFixture } from "../fixtures/release-recovery.js";

test("legacy partially failed releases recover the original artifact ID", async () => {
  const f = recoveryFixture();
  expect(await recoverRelease("rel-kit/relkit", "42", f.read)).toEqual({
    sha: f.sha,
    artifactId: "123",
    runId: "42",
  });
  expect(f.requests).toContain("/repos/rel-kit/relkit/actions/runs/42/attempts/1");
});

test("a rerun reuses its completed earlier attempt even with a different execution SHA", async () => {
  const f = recoveryFixture();
  f.run.head_sha = f.attempt.head_sha = "b".repeat(40);
  f.run.status = "in_progress";
  f.run.run_attempt = 2;
  f.jobs.jobs[0]!.name = `Build validated npm artifacts (${f.sha})`;
  expect(await findReleaseRecovery("rel-kit/relkit", f.sha, async () => true, f.read)).toEqual({
    sha: f.sha,
    artifactId: "123",
    runId: "42",
  });
  expect(await recoverRelease("rel-kit/relkit", "42", f.read)).toEqual({
    sha: f.sha,
    artifactId: "123",
    runId: "42",
  });
});

test("run pagination reaches the original and missing ancestry fails closed", async () => {
  const f = recoveryFixture();
  const read = async (path: string) =>
    path.endsWith("page=1")
      ? JSON.stringify({
          total_count: 101,
          workflow_runs: Array.from({ length: 100 }, (_, index) => ({
            ...f.run,
            id: index + 100,
            head_sha: "b".repeat(40),
          })),
        })
      : f.read(path);
  expect(
    await findReleaseRecovery("rel-kit/relkit", f.sha, async (sha) => sha === f.sha, read),
  ).toEqual({ sha: f.sha, artifactId: "123", runId: "42" });
  expect(f.requests.some((path) => path.endsWith("page=2"))).toBe(true);
  await expect(
    findReleaseRecovery(
      "rel-kit/relkit",
      f.sha,
      async () => {
        throw new Error("Missing Git object");
      },
      f.read,
    ),
  ).rejects.toThrow("Missing Git object");
});

test("a successful pack without its original artifact never becomes a fresh pack", async () => {
  const f = recoveryFixture();
  f.artifacts.artifacts = [];
  f.artifacts.total_count = 0;
  await expect(
    findReleaseRecovery("rel-kit/relkit", f.sha, async () => true, f.read),
  ).rejects.toThrow("Original release archives");
});

test("foreign execution, incomplete attempts and truncated or replaced archives are refused", async () => {
  for (const change of [
    (f: ReturnType<typeof recoveryFixture>) => {
      f.run.head_branch = "feature";
    },
    (f: ReturnType<typeof recoveryFixture>) => {
      f.run.head_repository.full_name = "attacker/relkit";
    },
    (f: ReturnType<typeof recoveryFixture>) => {
      f.run.path = ".github/workflows/other.yml";
    },
    (f: ReturnType<typeof recoveryFixture>) => {
      f.run.event = "pull_request";
    },
    (f: ReturnType<typeof recoveryFixture>) => {
      f.attempt.status = "in_progress";
    },
    (f: ReturnType<typeof recoveryFixture>) => {
      f.attempt.run_attempt = 2;
    },
    (f: ReturnType<typeof recoveryFixture>) => {
      f.jobs.jobs = [];
      f.jobs.total_count = 0;
    },
    (f: ReturnType<typeof recoveryFixture>) => {
      f.jobs.total_count = 101;
    },
    (f: ReturnType<typeof recoveryFixture>) => {
      f.artifacts.total_count = 101;
    },
    (f: ReturnType<typeof recoveryFixture>) => {
      f.artifacts.artifacts[0]!.expired = true;
    },
    (f: ReturnType<typeof recoveryFixture>) => {
      f.artifacts.artifacts[0]!.updated_at = "2026-10-26T11:00:00Z";
    },
    (f: ReturnType<typeof recoveryFixture>) => {
      f.artifacts.artifacts.push({ ...f.artifacts.artifacts[0]!, id: 124 });
      f.artifacts.total_count = 2;
    },
    (f: ReturnType<typeof recoveryFixture>) => {
      f.jobs.jobs.push({ ...f.jobs.jobs[0]!, run_attempt: 2 });
      f.jobs.total_count = 2;
    },
  ]) {
    const f = recoveryFixture();
    change(f);
    await expect(recoverRelease("rel-kit/relkit", "42", f.read)).rejects.toThrow();
  }
});
