/** Waits for the dispatching CI run to finish, then admits only its exact successful main commit; no package install or publication occurs here. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ReleaseCiRun } from "./release-ci-verification.types.js";

/**
 * Verifies real completed CI rather than treating a successful dispatch as proof.
 * @param repository - Trusted owner/repository from the release job context.
 * @param sha - Exact main commit checked out by the release job.
 * @param runId - Run that explicitly dispatched this release after its CI gate.
 * @param read - Bounded authenticated lookup of that run's current state.
 * @param pause - Finite polling delay, injectable for deterministic tests.
 * @param now - Clock used to reject completion outside the admission window.
 * @returns Completion only after the exact run finishes successfully.
 */
export async function verifyReleaseCi(
  repository: string,
  sha: string,
  runId: string,
  read: () => Promise<ReleaseCiRun>,
  pause: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 5_000)),
  now: () => number = Date.now,
): Promise<void> {
  assert.match(repository, /^[\w.-]+\/[\w.-]+$/);
  assert.match(sha, /^[a-f0-9]{40}$/);
  assert.match(runId, /^[1-9][0-9]*$/);
  const deadline = now() + 300_000;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (now() >= deadline) break;
    const run = await read();
    if (now() >= deadline) break;
    assert.equal(String(run.id), runId);
    assert.equal(run.name, "CI");
    assert.equal(run.path, ".github/workflows/checks.yml");
    assert.equal(run.head_branch, "main");
    assert.equal(run.head_repository.full_name, repository);
    assert.equal(run.head_sha, sha);
    assert.ok(["push", "workflow_dispatch"].includes(run.event));
    if (run.status === "completed") {
      assert.equal(run.conclusion, "success");
      return;
    }
    if (attempt < 59) await pause();
  }
  throw new Error(`CI run ${runId} did not complete within five minutes`);
}

if (import.meta.main) {
  const repository = process.env.GITHUB_REPOSITORY ?? "";
  const runId = process.env.CI_RUN_ID ?? "";
  const sha = process.env.VERIFIED_SHA ?? "";
  // Validate inputs before interpolating them into the authenticated API path.
  assert.match(repository, /^[\w.-]+\/[\w.-]+$/);
  assert.match(runId, /^[1-9][0-9]*$/);
  const execute = promisify(execFile);
  const read = async (): Promise<ReleaseCiRun> => {
    const { stdout } = await execute(
      "gh",
      ["api", "--hostname", "github.com", `/repos/${repository}/actions/runs/${runId}`],
      { timeout: 30_000, maxBuffer: 1024 * 1024, encoding: "utf8" },
    );
    // Foreign JSON is admitted only after verifyReleaseCi checks every authority field.
    return JSON.parse(stdout);
  };
  await verifyReleaseCi(repository, sha, runId, read);
  console.log(`Verified completed CI run ${runId} for ${sha}`);
}
