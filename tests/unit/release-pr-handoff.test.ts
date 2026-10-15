import { expect, test } from "bun:test";
import { handoffRelease } from "../../scripts/release-pr-handoff.ts";

const repository = "rel-kit/relkit";
const head = "a".repeat(40);
const merged = "b".repeat(40);
const run = {
  head_branch: "changeset-release/main",
  head_sha: head,
  head_repository: { full_name: repository },
  event: "pull_request",
  conclusion: "success",
};
const pr = {
  number: 117,
  state: "closed",
  merged: true,
  merge_commit_sha: merged,
  head: { sha: head, ref: run.head_branch, repo: { full_name: repository } },
  base: { ref: "main", repo: { full_name: repository } },
};

function fixture(
  options: { open?: boolean; changed?: boolean; advanced?: boolean; existing?: boolean } = {},
) {
  const writes: unknown[] = [];
  let reads = 0;
  let pauses = 0;
  const api = async (path: string, body?: Record<string, string>): Promise<unknown> => {
    if (body) {
      writes.push({ path, body });
      return undefined;
    }
    if (path.includes("/pulls?")) return [pr];
    if (path.endsWith("/pulls/117")) {
      reads++;
      if (options.changed) return { ...pr, head: { ...pr.head, sha: "c".repeat(40) } };
      if (options.open && reads === 1) return { ...pr, state: "open", merged: false };
      return pr;
    }
    if (path.endsWith("/git/ref/heads/main"))
      return { object: { sha: options.advanced ? head : merged } };
    if (path.includes("/actions/workflows/checks.yml/runs?"))
      return {
        workflow_runs: options.existing
          ? [{ ...run, head_sha: merged, head_branch: "main", event: "push" }]
          : [],
      };
    throw new Error(`Unexpected API path: ${path}`);
  };
  return {
    api,
    writes,
    reads: () => reads,
    pause: async () => {
      pauses++;
    },
    pauses: () => pauses,
  };
}

test("a repaired release PR hands off after merge without its original version job", async () => {
  const mock = fixture({ open: true });
  expect(await handoffRelease(repository, run, mock.api, mock.pause)).toContain(
    "dispatched main CI",
  );
  expect(mock.reads()).toBe(2);
  expect(mock.pauses()).toBe(1);
  expect(mock.writes).toEqual([
    {
      path: "/repos/rel-kit/relkit/actions/workflows/checks.yml/dispatches",
      body: { ref: "main" },
    },
  ]);
});

test("successful manually dispatched release-branch CI also recovers publication", async () => {
  const mock = fixture();
  await handoffRelease(repository, { ...run, event: "workflow_dispatch" }, mock.api, mock.pause);
  expect(mock.writes).toHaveLength(1);
});

test("closed unmerged and unrelated PRs cannot dispatch main CI", async () => {
  for (const candidate of [
    { ...pr, merged: false },
    { ...pr, base: { ...pr.base, ref: "develop" } },
    { ...pr, head: { ...pr.head, repo: { full_name: "fork/relkit" } } },
  ]) {
    const result = await handoffRelease(repository, run, async (path, body) => {
      expect(body).toBeUndefined();
      return path.includes("/pulls?") ? [candidate] : candidate;
    });
    expect(result).not.toContain("dispatched");
  }
});

for (const options of [{ changed: true }, { advanced: true }, { existing: true }])
  test(`does not dispatch redundant or stale main CI: ${JSON.stringify(options)}`, async () => {
    const mock = fixture(options);
    await handoffRelease(repository, run, mock.api, mock.pause);
    expect(mock.writes).toHaveLength(0);
  });

for (const invalid of [
  { ...run, conclusion: "failure" },
  { ...run, head_repository: { full_name: "fork/relkit" } },
  { ...run, head_branch: "feature" },
  { ...run, event: "push" },
])
  test(`rejects untrusted handoff input: ${JSON.stringify(invalid)}`, async () => {
    let called = false;
    await expect(
      handoffRelease(repository, invalid, async () => {
        called = true;
      }),
    ).rejects.toThrow();
    expect(called).toBe(false);
  });

test("unmerged release PRs have a finite handoff deadline and never dispatch publication", async () => {
  let pauses = 0;
  const result = handoffRelease(
    repository,
    run,
    async (path) => (path.includes("/pulls?") ? [pr] : { ...pr, state: "open", merged: false }),
    async () => {
      pauses++;
    },
  );
  await expect(result).rejects.toThrow("did not merge within five minutes");
  expect(pauses).toBe(59);
});
