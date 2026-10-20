import { expect, test } from "bun:test";
import { findReleaseRecovery, recoverRelease } from "../../scripts/release-recovery.ts";

const sha = "a".repeat(40);
function responses() {
  return [
    {
      path: ".github/workflows/ci.yml",
      head_branch: "main",
      head_sha: sha,
      event: "workflow_dispatch",
      status: "completed",
      head_repository: { full_name: "rel-kit/relkit" },
    },
    { jobs: [{ name: "Build validated npm artifacts", conclusion: "success" }] },
    { artifacts: [{ id: 123, name: `npm-release-${sha}`, expired: false }] },
  ];
}

test("a partially failed main release recovers its original artifact ID", async () => {
  const values = responses();
  const requests: string[] = [];
  expect(
    await recoverRelease("rel-kit/relkit", "42", async (path) => {
      requests.push(path);
      return values.shift();
    }),
  ).toEqual({ sha, artifactId: "123", runId: "42" });
  expect(requests.every((path) => path.startsWith("/repos/rel-kit/relkit/actions/runs/42"))).toBe(
    true,
  );
});

test("automatic retries reuse a prior validated pack and ignore unfinished runs", async () => {
  const values = [
    {
      workflow_runs: [
        { id: 44, head_sha: sha, status: "in_progress" },
        { id: 42, head_sha: sha, status: "completed" },
      ],
    },
    responses()[1],
    ...responses(),
  ];
  expect(
    await findReleaseRecovery("rel-kit/relkit", sha, "44", async () => values.shift()),
  ).toEqual({ sha, artifactId: "123", runId: "42" });
});

test("recovery refuses foreign, unvalidated, ambiguous, and expired archives", async () => {
  for (const change of [
    (v: ReturnType<typeof responses>) => {
      Object.assign(v[0]!, { head_branch: "feature" });
    },
    (v: ReturnType<typeof responses>) => {
      Object.assign(v[0]!, { head_repository: { full_name: "attacker/relkit" } });
    },
    (v: ReturnType<typeof responses>) => {
      Object.assign(v[0]!, { path: ".github/workflows/other.yml" });
    },
    (v: ReturnType<typeof responses>) => {
      Object.assign(v[0]!, { status: "in_progress" });
    },
    (v: ReturnType<typeof responses>) => {
      Object.assign(v[1]!, { jobs: [] });
    },
    (v: ReturnType<typeof responses>) => {
      Object.assign(v[2]!, { artifacts: [{ id: 123, name: `npm-release-${sha}`, expired: true }] });
    },
    (v: ReturnType<typeof responses>) => {
      Object.assign(v[2]!, { artifacts: [] });
    },
    (v: ReturnType<typeof responses>) => {
      Object.assign(v[2]!, {
        artifacts: [
          { id: 123, name: `npm-release-${sha}`, expired: false },
          { id: 124, name: `npm-release-${sha}`, expired: false },
        ],
      });
    },
  ]) {
    const values = responses();
    change(values);
    await expect(
      recoverRelease("rel-kit/relkit", "42", async () => values.shift()),
    ).rejects.toThrow();
  }
});
